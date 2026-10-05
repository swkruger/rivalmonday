import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { resolveBranding } from '@cs/email';
import { getMigrations } from 'better-auth/db/migration';
import { Pool } from 'pg';
import { afterAll, expect, it } from 'vitest';
import { buildAuthOptions } from './auth-options';
import type { WebEnv } from './env';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.owner });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

// If this fails after a Better Auth upgrade, add a NEW migration with the SQL compileMigrations() prints — never edit 0035.
it('migration 0035 matches what Better Auth expects (no pending auth migrations)', async () => {
  const env: WebEnv = { appUrl: 'http://localhost:3000', appDatabaseUrl: '', serviceDatabaseUrl: '', queueDatabaseUrl: '', authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'x@y.co', google: null, defaultAgencyId: null };
  const opts = buildAuthOptions({ env, service: dbs.service, pool, sendEmail: async () => {}, runInBackground: () => {}, branding: async () => resolveBranding('x', null) });
  const warnings: string[] = [];
  const m = await getMigrations({ ...opts, logger: { log: (level, message) => void (level === 'warn' || level === 'error' ? warnings.push(message) : undefined) } }, { throwOnUnsafe: false });
  expect({
    created: m.toBeCreated.map((t) => t.table), added: m.toBeAdded.map((t) => t.table), indexes: m.toBeAddedIndexes.map((i) => i.name), problems: m.schemaProblems,
    // Column type/nullability drift is only logged, never returned. The one tolerated warning is a Better Auth 1.7.7
    // false positive: it creates rateLimit.lastRequest as bigint, but its own type matcher does not list int8.
    warnings: warnings.filter((w) => w !== 'Field lastRequest in table rateLimit has a different type in the database. Expected number but got int8.'),
  }).toEqual({ created: [], added: [], indexes: [], problems: [], warnings: [] });
});
