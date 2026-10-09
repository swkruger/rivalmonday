import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { resolveEnvironment } from '@cs/db';
import { redactPgOutput } from '../snapshot/pg-tools';
import { parseRestoreArgs, restoreSnapshot } from '../snapshot/restore';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const args = parseRestoreArgs(process.argv.slice(2));
  // pnpm runs this from packages/demo; INIT_CWD is where the owner typed the command.
  const folder = resolve(process.env.INIT_CWD ?? process.cwd(), args.folder);
  const dev = resolveEnvironment('dev', { repoRoot: repoRoot() });
  const r = await restoreSnapshot({ folder, into: args.into, maintenanceUrl: dev.ownerUrl, repoRoot: repoRoot(), prompt: (q) => rl.question(q) });
  console.log(`Restored into ${r.target}.`);
  if (r.differences.length || r.restoreErrors) process.exitCode = 1;
} catch (e) {
  console.error(`[restore] failed: ${redactPgOutput(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
