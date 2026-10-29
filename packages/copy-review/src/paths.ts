import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root (this file is `packages/copy-review/src/paths.ts`). */
export const repoRoot = (): string => fileURLToPath(new URL('../../..', import.meta.url));

/** The sign-off ledger `docs/copy/signoff.json` under `root`. */
export const ledgerPathFor = (root: string): string => join(root, 'docs', 'copy', 'signoff.json');

/** True when the module at `metaUrl` is the script node/tsx was started with. */
export const isMainModule = (metaUrl: string): boolean =>
  process.argv[1] !== undefined && fileURLToPath(metaUrl) === process.argv[1];
