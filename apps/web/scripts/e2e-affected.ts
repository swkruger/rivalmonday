/**
 * Runs only the Playwright E2E tests a change can affect (see `e2e-affected-rules.ts`), and rebuilds the production
 * server only when `apps/web` or `packages` changed since the last build this script made.
 *
 *   pnpm --filter @cs/web e2e:affected [--base <ref>] [--dry-run] [--full] [--skip-build]
 *
 * `--base` defaults to `git merge-base HEAD main`. `--full` runs every test (still stamp-checked). `--skip-build`
 * trusts the existing `.next` build without checking the stamp (expert). Plain `pnpm e2e` still always builds.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_SERVER_ENV } from '../playwright.config';
import { grepFor, resolveAffected, specTagsFrom } from './e2e-affected-rules';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const E2E_DIR = join(WEB_DIR, 'e2e');
const STAMP = join(WEB_DIR, '.next', 'e2e-build-stamp');
const BUILD_ID = join(WEB_DIR, '.next', 'BUILD_ID');
/** The stamp also records the build id, so any other build into `.next` (a dev-env `pnpm build`) invalidates it. */
const readBuildId = () => (existsSync(BUILD_ID) ? readFileSync(BUILD_ID, 'utf8').trim() : 'none');

function parseArgs(argv: string[]) {
  const opts = { base: null as string | null, dryRun: false, full: false, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = argv[++i] ?? null;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--skip-build') opts.skipBuild = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: WEB_DIR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function changedFiles(base: string): string[] {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const run = (args: string[]) => lines(spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '');
  return [
    ...new Set([
      ...run(['diff', '--name-only', `${base}...HEAD`]),
      ...run(['diff', '--name-only', 'HEAD']),
      ...run(['ls-files', '--others', '--exclude-standard']),
    ]),
  ].sort();
}

function readSpecTags(): Record<string, string[]> {
  const sources: Record<string, string> = {};
  for (const f of readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'))) sources[f] = readFileSync(join(E2E_DIR, f), 'utf8');
  return specTagsFrom(sources);
}

/** What the production build depends on: HEAD, uncommitted and untracked changes under apps/web and packages, the env. */
function buildFingerprint(): string {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const scope = ['--', 'apps/web', 'packages'];
  const h = createHash('sha256');
  h.update(git(['rev-parse', 'HEAD']));
  h.update(spawnSync('git', ['diff', 'HEAD', ...scope], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout ?? '');
  for (const f of lines(spawnSync('git', ['ls-files', '--others', '--exclude-standard', ...scope], { cwd: root, encoding: 'utf8' }).stdout ?? '')) {
    h.update(`\0${f}\0`);
    try {
      h.update(readFileSync(join(root, f)));
    } catch {
      // vanished between listing and reading
    }
  }
  h.update(JSON.stringify(Object.entries(E2E_SERVER_ENV).sort()));
  return h.digest('hex');
}

const seconds = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1);

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = opts.base ?? git(['merge-base', 'HEAD', 'main']).trim();
  const files = changedFiles(base);
  const decision = opts.full ? { mode: 'all' as const, tags: [], reasons: ['--full'] } : resolveAffected(files, readSpecTags());

  console.log(`Changed files vs ${base.slice(0, 12)}: ${files.length}`);
  console.log(`Mode: ${decision.mode}${decision.mode === 'some' ? `  tags: ${decision.tags.join(' ')}` : ''}`);
  for (const r of decision.reasons.slice(0, 10)) console.log(`  ${r}`);
  if (decision.reasons.length > 10) console.log(`  … and ${decision.reasons.length - 10} more`);
  if (decision.mode === 'none') {
    console.log('No E2E needed for these changes.');
    return;
  }
  const grep = decision.mode === 'some' ? grepFor(decision.tags) : null;
  if (opts.dryRun) {
    console.log(grep ? `Would run: playwright test --grep "${grep}"` : 'Would run: playwright test (all tests)');
    return;
  }

  const env = { ...process.env, ...E2E_SERVER_ENV };
  if (!opts.skipBuild) {
    const fingerprint = buildFingerprint();
    const stamp = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : null;
    if (stamp === `${fingerprint} ${readBuildId()}`) console.log('Build is current (stamp matches); skipping the build.');
    else {
      const t0 = Date.now();
      const b = spawnSync('pnpm build && pnpm check:no-dev-panel', { cwd: WEB_DIR, env, stdio: 'inherit', shell: true });
      console.log(`Build: ${seconds(t0)} s`);
      if (b.status !== 0) process.exit(b.status ?? 1);
      writeFileSync(STAMP, `${fingerprint} ${readBuildId()}\n`);
    }
  }

  // Run the Playwright CLI through node directly: no shell, so the grep's `|` and `(?!` reach it intact.
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const t1 = Date.now();
  const r = spawnSync(process.execPath, [cli, 'test', ...(grep ? ['--grep', grep] : [])], {
    cwd: WEB_DIR,
    env: { ...process.env, E2E_SKIP_BUILD: '1' },
    stdio: 'inherit',
  });
  console.log(`Tests: ${seconds(t1)} s`);
  process.exit(r.status ?? 1);
}

main();
