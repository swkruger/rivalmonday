// Regression test for the production bug found during Phase 4b live verification:
// `pnpm --filter @cs/worker deliver-once dispatch ...` (tsx src/main.ts in prod) crashed
// with "ReferenceError: React is not defined" when rendering @cs/email templates, because
// tsx only resolves ONE tsconfig.json (nearest to its cwd) and applies it to every file it
// transforms — it never looks up a per-file nearest tsconfig. Files pulled in from another
// workspace package (packages/email/src/**/*.tsx, reached from apps/worker's node_modules
// symlink) therefore fall outside apps/worker/tsconfig.json's `include` glob, tsx silently
// drops the `jsx: "react-jsx"` setting for them, and esbuild falls back to the classic
// `React.createElement` transform with no `React` in scope.
//
// vitest's own transform (packages/email/vitest.config.ts forces `esbuild: { jsx: 'automatic' }`)
// never exercises this path, so unit tests passed while the real `tsx src/main.ts` worker
// would have failed on every email. This test spawns the real tsx CLI (the same loader the
// worker binary uses in production) against a small fixture script, so it fails the same way
// the production worker did before the fix, and passes once packages/email's .tsx files carry
// a self-describing JSX pragma that any loader (tsx, vitest, tsc) honours regardless of
// tsconfig resolution.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// Resolve tsx's actual CLI entry point rather than node_modules/.bin/tsx: the .bin shim is a
// POSIX shebang script (plus separate .CMD/.ps1 wrappers on Windows) that execFile cannot run
// directly without a shell, and shelling out reintroduces platform-specific quoting. Spawning
// `node <tsx cli.mjs>` is the loader the production `tsx src/main.ts` invocation resolves to on
// every platform.
const tsxPkgPath = require.resolve('tsx/package.json');
const tsxPkg = require(tsxPkgPath) as { bin: string };
const tsxCliPath = path.join(path.dirname(tsxPkgPath), tsxPkg.bin);

const workerRoot = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = fileURLToPath(new URL('./email-runtime.fixture.mts', import.meta.url));

describe('email runtime (real tsx loader)', () => {
  it('renders a @cs/email template without "React is not defined"', async () => {
    const { stdout } = await execFileAsync(process.execPath, [tsxCliPath, fixturePath], { cwd: workerRoot });
    expect(stdout).toContain('Your brief is ready');
    expect(stdout).toContain('<html');
  }, 30_000);
});
