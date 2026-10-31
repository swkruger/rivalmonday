import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { stagingWorkerEnv } from '../staging/worker-env';
import { repoRoot } from './repo';

const root = repoRoot();
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function fail(message: string): never {
  console.error(`[staging-worker] ${message}`);
  process.exit(1);
}

// main.ts always loads <checkout>/.env, and that fills any variable left unset: this checkout must not have one.
if (existsSync(join(root, '.env'))) fail('this checkout has a .env, and the worker would load dev values from it. Run from the staging worker checkout (docs/STAGING.md § Local worker).');
if (git('status', '--porcelain')) fail('this checkout has uncommitted changes. Staging runs main only.');
git('fetch', '-q', 'origin', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
  fail('this checkout is not on the latest main, and CI migrates staging to it. Run: git checkout --detach origin/main; pnpm install --frozen-lockfile');
}

// .env.staging lives in the main checkout: the common git dir is <main checkout>/.git.
const file = join(dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')), '.env.staging');
if (!existsSync(file)) fail(`${file} not found`);

let env: NodeJS.ProcessEnv;
try {
  env = stagingWorkerEnv(parseEnv(readFileSync(file, 'utf8')), process.env);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

console.log(`[staging-worker] starting ${git('rev-parse', '--short', 'HEAD')} against staging. Ctrl+C stops it.`);
const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], { cwd: join(root, 'apps', 'worker'), env, stdio: 'inherit' });
// The worker drains on the signal itself; stay alive until it has exited.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {});
child.on('exit', (code) => process.exit(code ?? 1));
