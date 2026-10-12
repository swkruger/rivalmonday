#!/usr/bin/env node
// Affected-only unit tests: packages changed since <base> (and their dependents) via `turbo --affected`, and inside
// each package only the test files whose import graph reaches a changed file (`vitest --changed <base>`).
// The full suite (`pnpm test`) runs at /rm-merge and in CI.
//
//   pnpm test:affected [--base <ref>] [--dry-run] [--packages-only]
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const base = value('--base') ?? git('merge-base', 'HEAD', 'main');
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const changed = [
  ...new Set([
    ...lines(git('diff', '--name-only', `${base}...HEAD`)),
    ...lines(git('diff', '--name-only', 'HEAD')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ]),
];

// Files the import graph can't see (SQL, test harness, config): run every test of the affected packages instead.
const GRAPH_BLIND = [
  /^packages\/db\/migrations\//,
  /(^|\/)test\/[^/]+\.ts$/, // test harness: global-setup, helpers, setup
  /(^|\/)vitest\.(config|setup)\.\w+$/,
  /-fixtures\.ts$/,
  /(^|\/)package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^turbo\.json$/,
  /\.(sql|ya?ml|json)$/,
];
const blind = changed.filter((f) => GRAPH_BLIND.some((re) => re.test(f)));
const fileLevel = !flag('--packages-only') && blind.length === 0;

const turbo = ['turbo', 'run', 'test', '--affected', '--concurrency=1', '--continue'];
const turboArgs = fileLevel ? [...turbo, '--', '--changed', base, '--passWithNoTests'] : turbo;

console.log(`base ${base.slice(0, 10)} · ${changed.length} changed file(s)`);
if (blind.length) console.log(`package-level (import graph can't see): ${blind.slice(0, 5).join(', ')}${blind.length > 5 ? ' …' : ''}`);
else console.log(fileLevel ? 'file-level: vitest --changed inside each affected package' : 'package-level (--packages-only)');

const env = { ...process.env, TURBO_SCM_BASE: base };
const dry = spawnSync('npx', [...turbo, '--dry=json'], { encoding: 'utf8', env, shell: true });
const pkgs = dry.status === 0 ? JSON.parse(dry.stdout).tasks.map((t) => t.package) : [];
console.log(pkgs.length ? `affected packages: ${pkgs.join(' ')}` : 'No affected packages — nothing to test.');
if (flag('--dry-run') || pkgs.length === 0) process.exit(dry.status === 0 ? 0 : 1);

const started = Date.now();
const run = spawnSync('npx', turboArgs, { stdio: 'inherit', env, shell: true });
console.log(`test:affected finished in ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(run.status ?? 1);
