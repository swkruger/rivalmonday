import { fileURLToPath } from 'node:url';

/**
 * Loads the repo-root `.env`. Imported FIRST by the CLI: ES modules evaluate their imports before the importer's body,
 * and `@cs/db/test-helpers` reads the TEST_* URLs when it loads (an env load in the CLI body would come too late and
 * the Ask suite would fall back to the default `cs_test` URLs).
 */
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // .env is optional (variables may come from the shell or CI); never print it.
}
