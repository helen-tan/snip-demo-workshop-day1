import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'bundle', 'release.json'), 'utf8'));
for (const name of ['backend', 'frontend', 'cli']) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: resolve(root, name), encoding: 'utf8',
  }).trim();
  const entry = execFileSync('git', ['ls-tree', 'HEAD', name], {
    cwd: root, encoding: 'utf8',
  }).trim();
  assert.equal(entry.split(/\s+/)[0], '160000');
  assert.equal(entry.split(/\s+/)[2], head, `${name} differs from main pin`);
  assert.equal(manifest.sources[name], head, `${name} differs from release manifest`);
}
for (const [component, file] of [['backend', 'server.js'], ['cli', 'cli.js']]) {
  assert.deepEqual(readFileSync(resolve(root, component, file)),
    readFileSync(resolve(root, 'bundle', file)), `${file} differs from source`);
}
assert.ok(existsSync(resolve(root, 'bundle', 'public', 'index.html')));
assert.ok(existsSync(resolve(root, 'bundle', 'public', '3rdpartylicenses.txt')));
assert.equal(JSON.parse(readFileSync(resolve(root, 'bundle', 'package.json'), 'utf8')).type,
  undefined, 'Bundled CLI must remain CommonJS');
console.log('PASS release manifest, main gitlinks, source copies, UI, licenses and CommonJS');
