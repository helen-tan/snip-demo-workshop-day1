'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { openLink } = require('../cli');

const cliPath = path.join(__dirname, '..', 'cli.js');

async function withApi(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function runCli(args, apiBase) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: apiBase },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('help prints usage without contacting the API', async () => {
  const result = await runCli(['help'], 'not a URL');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});

test('add validates URLs and prints the created short URL', async () => {
  let received;
  await withApi(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'a1B2c3', shortUrl: 'http://localhost:3000/a1B2c3' }));
  }, async (apiBase) => {
    const invalid = await runCli(['add', 'file:///tmp/file'], apiBase);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /http:\/\/ or https:\/\//);

    const result = await runCli(['add', 'https://example.com/path'], apiBase);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'http://localhost:3000/a1B2c3\n');
    assert.deepEqual(received, { url: 'https://example.com/path' });
  });
});

test('ls displays the empty state and aligned link columns', async () => {
  let requestCount = 0;
  await withApi((request, response) => {
    requestCount += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(requestCount === 1 ? [] : [
      { code: 'a1B2c3', hits: 2, url: 'https://one.example' },
      { code: 'longcode', hits: 10, url: 'https://two.example' },
    ]));
  }, async (apiBase) => {
    const empty = await runCli(['ls'], apiBase);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.stdout, 'No links yet.\n');

    const result = await runCli(['ls'], apiBase);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CODE\s+HITS\s+URL/);
    assert.match(result.stdout, /a1B2c3\s+2\s+https:\/\/one\.example/);
    assert.match(result.stdout, /longcode\s+10\s+https:\/\/two\.example/);
  });
});

test('open reads the redirect Location without following it', async () => {
  let destinationRequested = false;
  await withApi((request, response) => {
    if (request.url === '/a1B2c3') {
      response.writeHead(302, { location: 'https://example.com/target' });
      response.end();
      return;
    }
    destinationRequested = true;
    response.writeHead(200);
    response.end();
  }, async (apiBase) => {
    let opened;
    await openLink(apiBase, 'a1B2c3', async (url) => {
      opened = url;
    });
    assert.equal(opened, 'https://example.com/target');
    assert.equal(destinationRequested, false);
  });
});

test('API errors and unreachable backends use stderr and exit 1', async () => {
  await withApi((request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Unknown code' }));
  }, async (apiBase) => {
    const result = await runCli(['ls'], apiBase);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown code/);
  });

  const unreachable = await runCli(['ls'], 'http://127.0.0.1:1');
  assert.equal(unreachable.status, 1);
  assert.match(unreachable.stderr, /Could not reach the API/);
});
