import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/demo/src/cli → repo root. */
export const repoRoot = (): string => fileURLToPath(new URL('../../../../', import.meta.url));

export function loadRepoEnv(): void {
  try {
    process.loadEnvFile(join(repoRoot(), '.env'));
  } catch {
    // .env is optional (variables may come from the shell); never print it.
  }
}
