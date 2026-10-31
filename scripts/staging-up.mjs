#!/usr/bin/env node
// docs/STAGING.md § Local worker: creates or updates the staging worker checkout, then runs the worker from it.
// Usage (from any checkout of this repo): pnpm staging:up
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const fail = (message) => {
  console.error(`[staging-up] ${message}`);
  process.exit(1);
};

// The common git dir is <main checkout>/.git, wherever this script runs from.
const main = dirname(git(here, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
const checkout = join(dirname(main), 'CompetitorSpy-wt', 'staging-worker');

console.log('[staging-up] fetching the latest main...');
git(main, 'fetch', '-q', 'origin', 'main');
try {
  git(main, 'cat-file', '-e', 'origin/main:packages/demo/src/cli/staging-worker.ts');
} catch {
  fail('origin/main has no staging worker yet. Run: git push origin main');
}

if (existsSync(join(checkout, '.git'))) {
  git(checkout, 'checkout', '-q', '--detach', 'origin/main');
} else {
  console.log(`[staging-up] creating ${checkout}...`);
  git(main, 'worktree', 'add', '-q', '--detach', checkout, 'origin/main');
}

// pnpm is a .cmd on Windows, which needs a shell; the arguments here are fixed strings.
const pnpm = (args) => (process.platform === 'win32' ? ['pnpm', args, { shell: true }] : ['pnpm', args, {}]);
const [installCmd, installArgs, installOpts] = pnpm(['install', '--frozen-lockfile']);
const install = spawnSync(installCmd, installArgs, { ...installOpts, cwd: checkout, stdio: 'inherit' });
if (install.status !== 0) fail('pnpm install failed');

const [runCmd, runArgs, runOpts] = pnpm(['staging:worker']);
const worker = spawn(runCmd, runArgs, { ...runOpts, cwd: checkout, stdio: 'inherit' });
// Ctrl+C reaches the worker too, and it drains first: stay alive until it has exited.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {});
worker.on('exit', (code) => process.exit(code ?? 1));
