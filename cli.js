#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;

function usage() {
  return [
    'Usage:',
    '  snip add <url>    Create a short link',
    '  snip ls           List links and hit counts',
    '  snip open <code>  Open a short link in your browser',
    '  snip help          Show this help',
    '',
    'Set SNIP_API to change the API base URL (default: http://localhost:3000).',
  ].join('\n');
}

function getApiBase() {
  const value = (process.env.SNIP_API || DEFAULT_API).replace(/\/+$/, '');
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host) {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }

  return value;
}

function validateUrl(value) {
  if (!value || value.trim() !== value) {
    throw new Error('Provide a valid http:// or https:// URL.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Provide a valid http:// or https:// URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('URL must use http:// or https://.');
  }

  return value;
}

function validateCode(value) {
  if (!/^[A-Za-z0-9]{6}$/.test(value || '')) {
    throw new Error('Code must be six letters or digits.');
  }

  return value;
}

async function request(apiBase, endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('The API request timed out.');
    }
    throw new Error(`Could not reach the API at ${apiBase}.`);
  }

  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('The API returned an invalid response.');
  }
}

async function apiError(response) {
  const body = await readJson(response).catch(() => null);
  if (body && typeof body.error === 'string' && body.error.trim()) {
    return body.error;
  }
  return `API request failed (${response.status} ${response.statusText}).`;
}

async function addLink(apiBase, url) {
  const response = await request(apiBase, '/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (response.status !== 201) {
    throw new Error(await apiError(response));
  }

  const link = await readJson(response);
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('The API response is missing the short URL.');
  }

  return link;
}

function formatLinks(links) {
  if (links.length === 0) {
    return 'No links yet.';
  }

  const rows = links.map((link) => {
    if (
      !link ||
      typeof link.code !== 'string' ||
      !Number.isFinite(link.hits) ||
      typeof link.url !== 'string'
    ) {
      throw new Error('The API returned an invalid link list.');
    }
    return [link.code, String(link.hits), link.url];
  });
  const codeWidth = Math.max(4, ...rows.map(([code]) => code.length));
  const hitsWidth = Math.max(4, ...rows.map(([, hits]) => hits.length));
  const header = ['CODE'.padEnd(codeWidth), 'HITS'.padStart(hitsWidth), 'URL'].join('  ');

  return [
    header,
    ...rows.map(([code, hits, url]) =>
      [code.padEnd(codeWidth), hits.padStart(hitsWidth), url].join('  '),
    ),
  ].join('\n');
}

async function listLinks(apiBase) {
  const response = await request(apiBase, '/api/links');
  if (!response.ok) {
    throw new Error(await apiError(response));
  }

  const links = await readJson(response);
  if (!Array.isArray(links)) {
    throw new Error('The API returned an invalid link list.');
  }

  return formatLinks(links);
}

function browserCommand() {
  if (process.platform === 'win32') {
    return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler'] };
  }
  if (process.platform === 'darwin') {
    return { command: 'open', args: [] };
  }
  return { command: 'xdg-open', args: [] };
}

function launchUrl(url) {
  const { command, args } = browserCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', () => reject(new Error('Could not launch the default browser.')));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function openLink(apiBase, code, launch = launchUrl) {
  const response = await request(apiBase, `/${encodeURIComponent(code)}`, {
    redirect: 'manual',
  });

  if (response.status === 404) {
    throw new Error(`No link found for code "${code}".`);
  }
  if (response.status !== 302) {
    throw new Error(await apiError(response));
  }

  const location = response.headers.get('location');
  if (!location) {
    throw new Error('The API redirect did not include a destination.');
  }

  let target;
  try {
    target = new URL(location);
  } catch {
    throw new Error('The API returned an invalid redirect destination.');
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('The API redirect must use http:// or https://.');
  }

  await launch(target.href);
  return target.href;
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const apiBase = getApiBase();
  if (command === 'add') {
    if (rest.length !== 1) {
      throw new Error('Usage: snip add <url>');
    }
    const link = await addLink(apiBase, validateUrl(rest[0]));
    process.stdout.write(`${link.shortUrl}\n`);
    return 0;
  }

  if (command === 'ls') {
    if (rest.length !== 0) {
      throw new Error('Usage: snip ls');
    }
    process.stdout.write(`${await listLinks(apiBase)}\n`);
    return 0;
  }

  if (command === 'open') {
    if (rest.length !== 1) {
      throw new Error('Usage: snip open <code>');
    }
    await openLink(apiBase, validateCode(rest[0]));
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  addLink,
  formatLinks,
  getApiBase,
  launchUrl,
  listLinks,
  main,
  openLink,
  validateCode,
  validateUrl,
};
