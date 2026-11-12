import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const external = process.env.SNIP_TEST_URL;
const target = process.argv.includes('--backend') ? 'backend' : 'bundle';
let child;
let origin = external;
let logs = '';

async function cli(args) {
  const proc = spawn(process.execPath, [resolve(root, 'cli', 'cli.js'), ...args], {
    env: { ...process.env, SNIP_API: origin }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (data) => { stdout += data; });
  proc.stderr.on('data', (data) => { stderr += data; });
  const [code] = await once(proc, 'close');
  assert.equal(code, 0, stderr);
  return stdout.trim();
}

try {
  if (!external) {
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const { port } = listener.address();
    await new Promise((done) => listener.close(done));
    origin = `http://127.0.0.1:${port}`;
    child = spawn(process.env.BUN_BIN || 'bun', ['server.js'], {
      cwd: resolve(root, target),
      env: { ...process.env, PORT: String(port), BASE_URL: origin,
        PUBLIC_DIR: target === 'bundle' ? './public' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { logs += data; });
    child.stderr.on('data', (data) => { logs += data; });
    child.on('error', (error) => { logs += error.message; });
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${origin}/api/links`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch (error) {
      if (child?.exitCode !== null && child?.exitCode !== undefined) throw error;
    }
    await sleep(100);
  }
  assert.ok(ready, `Server failed to start: ${logs}`);
  const api = `${origin}/api/links`;
  const preflight = await fetch(api, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  for (const body of ['{', '{"url":"file:///bad"}', '{}']) {
    const response = await fetch(api, { method: 'POST', body,
      headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const url = 'https://example.com/snip-smoke';
  const created = await fetch(api, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  assert.equal(created.status, 201);
  const link = await created.json();
  assert.deepEqual(Object.keys(link).sort(), ['code', 'url', 'shortUrl', 'hits', 'createdAt'].sort());
  assert.match(link.code, /^[0-9A-Za-z]{6}$/);
  assert.equal(link.url, url);
  assert.equal(link.hits, 0);
  assert.ok(Number.isFinite(Date.parse(link.createdAt)));
  assert.equal(link.shortUrl, `${origin}/${link.code}`);
  const redirect = await fetch(`${origin}/${link.code}`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), url);
  const links = await (await fetch(api)).json();
  assert.equal(links.find((item) => item.code === link.code).hits, 1);
  assert.equal((await fetch(`${origin}/unknown-code`)).status, 404);
  assert.match(await cli(['ls']), new RegExp(link.code));
  const shortUrl = await cli(['add', 'https://example.com/from-cli']);
  assert.ok(shortUrl.startsWith(`${origin}/`));
  if (target === 'bundle') {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<app-root/);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)];
    assert.ok(assets.length > 0);
    for (const [, asset] of assets) {
      assert.equal((await fetch(new URL(asset, `${origin}/`))).status, 200);
    }
  }
  console.log(`PASS ${target}: API contract, errors, CORS, redirects, hits, CLI${target === 'bundle' ? ', UI and assets' : ''}`);
} finally {
  if (child && child.exitCode === null && child.pid) {
    const exited = once(child, 'close');
    child.kill();
    await exited;
  }
}
