// docs/STAGING.md § 4: sends the staging worker's variables from .env.staging to Railway service rivalmonday-worker,
// after the same checks as the local worker. Usage (from any checkout): pnpm staging:railway-vars [--check]
// --check validates only. Values go to the Railway CLI on stdin; this prints variable names, never values.
// Runs the CLI in the staging-worker checkout, which `railway link` ties to project rivalmonday-staging.
// It never deletes a Railway variable: remove one in the dashboard. A change applies at the next worker deploy.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { railwayWorkerVars } from '../staging/worker-env';
import { repoRoot } from './repo';

const SERVICE = 'rivalmonday-worker';

function fail(message: string): never {
  console.error(`[staging-railway-vars] ${message}`);
  process.exit(1);
}

const main = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot(), encoding: 'utf8' }).trim());
const file = join(main, '.env.staging');
if (!existsSync(file)) fail(`${file} not found`);

let vars: Record<string, string>;
try {
  vars = railwayWorkerVars(parseEnv(readFileSync(file, 'utf8')));
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
const keys = Object.keys(vars).sort();
if (process.argv.includes('--check')) {
  console.log(`[staging-railway-vars] .env.staging passes the checks: ${keys.join(', ')}`);
  process.exit(0);
}

const checkout = join(dirname(main), 'CompetitorSpy-wt', 'staging-worker');
if (!existsSync(checkout)) fail(`${checkout} not found. Run STAGING.md § 4 step 9 first.`);

// railway is a .cmd shim on Windows, which needs a shell; every argument here is a fixed name, never a value.
for (const key of keys) {
  const r = spawnSync('railway', ['variable', 'set', key, '--stdin', '--skip-deploys', '--service', SERVICE], {
    cwd: checkout, input: vars[key], encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    // CLI errors can echo the value; print only the first line, with URLs masked.
    const why = (r.stderr || r.stdout || '').split('\n')[0]!.replace(/[a-z]+:\/\/\S+/gi, '<url>');
    fail(`setting ${key} failed: ${why} (not linked? STAGING.md § 4 step 9; not signed in? railway login)`);
  }
  console.log(`[staging-railway-vars] set ${key}`);
}
console.log(`[staging-railway-vars] ${keys.length} variables set on ${SERVICE}. They apply at the next deploy (STAGING.md § 4).`);
