import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const push = process.argv.includes('--push');
const pinned = process.argv.includes('--pinned');
for (const arg of process.argv.slice(2)) {
  if (!['--push', '--pinned'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
}
const sources = ['backend', 'frontend', 'cli'];
const bundle = join(root, 'bundle');

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stderr || ''}`);
  }
  return capture ? result.stdout.trim() : '';
}

function git(args, cwd = root, capture = false) {
  return run('git', args, cwd, capture);
}

function staged(cwd) {
  return git(['diff', '--cached', '--name-only'], cwd, true) !== '';
}

function commit(cwd, message) {
  git(['commit', '-m', message, '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\n' +
    'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>'], cwd);
}

function npm(args) {
  // npm.cmd needs cmd.exe on Windows; arguments here are fixed, never user input.
  if (process.platform === 'win32') {
    return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`],
      join(root, 'frontend'));
  }
  return run('npm', args, join(root, 'frontend'));
}

if (git(['branch', '--show-current'], root, true) !== 'main') {
  throw new Error('Run the bundle builder from a main checkout.');
}
const unexpected = git(['status', '--porcelain', '--ignore-submodules=all'], root, true)
  .split('\n').filter(Boolean).filter((line) => !/^.{3}(backend|frontend|cli|bundle)$/.test(line));
if (unexpected.length) throw new Error(`Commit unrelated main changes first:\n${unexpected.join('\n')}`);

git(['submodule', 'update', '--init', ...sources, 'bundle']);
for (const name of [...sources, 'bundle']) {
  if (git(['status', '--porcelain'], join(root, name), true)) {
    throw new Error(`${name} is dirty; commit or preserve its work before building.`);
  }
}
if (!pinned) git(['submodule', 'update', '--init', '--remote', ...sources]);
const revisions = Object.fromEntries(sources.map((name) =>
  [name, git(['rev-parse', 'HEAD'], join(root, name), true)]));
console.log('Building source revisions:', revisions);
npm(['ci', '--no-audit', '--no-fund']);
npm(['run', 'build']);
const output = join(root, 'frontend', 'dist', 'snip-frontend', 'browser');
if (!existsSync(join(output, 'index.html'))) {
  throw new Error('Missing frontend/dist/snip-frontend/browser/index.html');
}

// Only known generated paths are replaced; the submodule's .git file is preserved.
for (const name of ['public', 'server.js', 'cli.js', '.env', 'package.json',
  'Dockerfile', '.dockerignore', 'railway.json', 'release.json', 'README.md']) {
  const target = join(bundle, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
cpSync(output, join(bundle, 'public'), { recursive: true });
const licenses = join(root, 'frontend', 'dist', 'snip-frontend', '3rdpartylicenses.txt');
if (existsSync(licenses)) cpSync(licenses, join(bundle, 'public', '3rdpartylicenses.txt'));
const write = (name, content) => writeFileSync(join(bundle, name), content);
write('.env', 'PUBLIC_DIR=./public\n');
write('package.json', JSON.stringify({
  name: 'snip-bundle', private: true, scripts: { start: 'bun server.js' },
}, null, 2) + '\n');
write('Dockerfile', [
  'FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a',
  'WORKDIR /app',
  'COPY --chown=bun:bun . .',
  'ENV PORT=3000',
  'ENV PUBLIC_DIR=./public',
  'EXPOSE 3000',
  'USER bun',
  'CMD ["bun", "server.js"]',
  '',
].join('\n'));
write('.dockerignore', '.git\nnode_modules\n*.log\n.env*\n');
write('railway.json', JSON.stringify({
  $schema: 'https://railway.com/railway.schema.json',
  build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
  deploy: { healthcheckPath: '/api/links', healthcheckTimeout: 60,
    restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
}, null, 2) + '\n');
write('release.json', JSON.stringify({ sources: revisions }, null, 2) + '\n');
write('README.md', '# Generated Snip release\n\nDo not hand-edit. Run `node scripts/build-bundle.mjs` on main.\n\n' +
  'Start with `bun start`; Node 20+ can run `node cli.js help`.\n' +
  'This server serves the UI, API and redirects. Links are lost on restart.\n' +
  'Set BASE_URL for a custom public origin; Railway domain fallback is supported.\n' +
  'See release.json for exact source commits. Publication requires all release gates.\n');
if (readFileSync(join(bundle, 'server.js'), 'utf8') !==
    readFileSync(join(root, 'backend', 'server.js'), 'utf8')) {
  throw new Error('Bundled server differs from source');
}
git(['add', '--all'], bundle);
if (staged(bundle)) commit(bundle, 'Generate Snip bundle');
else console.log('Bundle unchanged; nothing to commit.');

if (push) {
  // Push even after a previous local-only build, when no new commit is needed.
  git(['push', 'origin', 'HEAD:bundle'], bundle);
}
git(['add', ...sources, 'bundle']);
if (staged(root)) commit(root, 'Pin verified source revisions and generated bundle');
else console.log('Superproject unchanged; nothing to commit.');
if (push) git(['push', 'origin', 'HEAD:main']);
