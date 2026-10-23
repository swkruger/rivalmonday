import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { type Db, createDb } from '../src/client';
import { seedVerticalCatalog } from '../src/catalog';
import { MIGRATIONS_FOLDER } from '../src/migrate';
import { agency, agencyBilling, client, clientCompetitor, competitor } from '../src/schema';

export { seedVerticalCatalog } from '../src/catalog';

export const testUrls = {
  owner: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cs_test',
  app: process.env.TEST_APP_DATABASE_URL ?? 'postgres://app_user:app_user@localhost:5432/cs_test',
  service: process.env.TEST_SERVICE_DATABASE_URL ?? 'postgres://app_service:app_service@localhost:5432/cs_test',
};

/** Drizzle 0.44 wraps driver errors (DrizzleQueryError); the Postgres message is on `cause`. */
export async function errorText(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
  }
  throw new Error('expected promise to reject');
}

export function openTestDbs() {
  const owner = createDb(testUrls.owner);
  const app = createDb(testUrls.app);
  const service = createDb(testUrls.service);
  return {
    owner: owner.db,
    app: app.db,
    service: service.db,
    closeAll: async () => {
      await Promise.all([owner.close(), app.close(), service.close()]);
    },
  };
}

/**
 * Empties every table in the public schema (except drizzle bookkeeping, which lives in schema "drizzle") and restarts
 * its sequences. Runs before most tests, so speed matters: each TRUNCATE swaps a table's data files, ~1.2 s for 52
 * tables on Windows. A superuser (local test cluster, CI) DELETEs with FK triggers off instead (~5–75 ms on test-sized
 * data); other owners (Neon's owner is not superuser) fall back to a single TRUNCATE statement (~0.4 s).
 */
async function truncateEverything(db: Db): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(sql`
        DO $$ DECLARE t text; s record; BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('DELETE FROM public.%I', t);
          END LOOP;
          FOR s IN SELECT schemaname, sequencename, start_value FROM pg_sequences WHERE schemaname = 'public' LOOP
            PERFORM setval(format('%I.%I', s.schemaname, s.sequencename)::regclass, s.start_value, false);
          END LOOP;
        END $$;`);
    });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if ((err.cause?.code ?? err.code) !== '42501') throw e; // insufficient_privilege: not a superuser
    await db.execute(sql`
      DO $$ BEGIN
        EXECUTE (SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', tablename), ', ') || ' RESTART IDENTITY CASCADE'
                 FROM pg_tables WHERE schemaname = 'public');
      END $$;`);
  }
}

/** Empties every public table, then restores the seeded vertical catalogue (generic, hvac_plumbing, dental; migration 0077 seeds it once, the truncate would wipe it). */
export async function truncateAll(db: Db): Promise<void> {
  await truncateEverything(db);
  await seedVerticalCatalog(db);
}

export const IDS = {
  agencyA: '00000000-0000-4000-8000-00000000000a',
  agencyB: '00000000-0000-4000-8000-00000000000b',
  clientA1: '00000000-0000-4000-8000-0000000000a1',
  clientA2: '00000000-0000-4000-8000-0000000000a2',
  clientB1: '00000000-0000-4000-8000-0000000000b1',
  competitorX: '00000000-0000-4000-8000-0000000000f1',
  competitorY: '00000000-0000-4000-8000-0000000000f2',
} as const;

/** A1 and B1 both track X (shared competitor); A2 tracks Y only. */
export async function seedTenancy(owner: Db): Promise<void> {
  await owner.insert(agency).values([
    { id: IDS.agencyA, name: 'Agency A' },
    { id: IDS.agencyB, name: 'Agency B' },
  ]);
  await owner.insert(client).values([
    { id: IDS.clientA1, agencyId: IDS.agencyA, name: 'A1 HVAC', verticalId: 'hvac_plumbing' },
    { id: IDS.clientA2, agencyId: IDS.agencyA, name: 'A2 Dental', verticalId: 'dental' },
    { id: IDS.clientB1, agencyId: IDS.agencyB, name: 'B1 HVAC', verticalId: 'hvac_plumbing' },
  ]);
  await owner.insert(competitor).values([
    { id: IDS.competitorX, name: 'Smith HVAC', domain: 'smithhvac.example' },
    { id: IDS.competitorY, name: 'Bright Smiles', domain: 'brightsmiles.example' },
  ]);
  await owner.insert(clientCompetitor).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX },
    { agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorY },
    { agencyId: IDS.agencyB, clientId: IDS.clientB1, competitorId: IDS.competitorX },
  ]);
}

/** Re-insert the 6 default `platform_cost_service` rows (migration 0051 seeds them; `truncateAll` wipes them). Idempotent. */
export async function seedPlatformCostServices(db: Db): Promise<void> {
  await db.execute(sql`
    insert into platform_cost_service (service, billing_url) values
      ('openrouter','https://openrouter.ai/settings/credits'),
      ('dataforseo','https://app.dataforseo.com/billing'),
      ('scrapecreators','https://app.scrapecreators.com'),
      ('apify','https://console.apify.com/billing'),
      ('anthropic','https://platform.claude.com/settings/billing'),
      ('neon','https://console.neon.tech/app/billing')
    on conflict do nothing`);
}

/** Phase 9a: puts an agency in a non-serviceable billing state (`read_only` by default) for scheduler/entry-point refusal tests. */
export async function pauseAgency(owner: Db, agencyId: string, state: 'read_only' | 'suspended' = 'read_only'): Promise<void> {
  await owner.insert(agencyBilling).values({ agencyId, state }).onConflictDoUpdate({ target: agencyBilling.agencyId, set: { state } });
}

/** Phase 9b: pauses a client (`paused_at` set) for scheduler-exclusion tests. */
export async function pauseClient(owner: Db, clientId: string, by = 'auto'): Promise<void> {
  await owner.update(client).set({ pausedAt: new Date(), pausedBy: by }).where(eq(client.id, clientId));
}

/** Phase 7b1: spend-pauses a client (`spend_paused_at` set; `paused_at` untouched) for scheduler-exclusion tests. */
export async function spendPauseClient(owner: Db, clientId: string): Promise<void> {
  await owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, clientId));
}

/** `testUrls.owner` with another role's credentials (local/CI roles use password = name), optionally another database. */
export function roleUrl(role: string, database?: string): string {
  const u = new URL(testUrls.owner);
  u.username = role;
  u.password = role;
  if (database) u.pathname = `/${database}`;
  return u.toString();
}

/** `testUrls.owner` pointed at another database on the same server. */
export function ownerUrlFor(database: string): string {
  const u = new URL(testUrls.owner);
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * Runs ONE migration (by journal tag) through the real drizzle migrator, from a temp folder holding only that entry,
 * against `url` (normally a scratch database). `edit` may rewrite its SQL first (e.g. point a check at a missing role).
 */
export async function applySingleMigration(url: string, tag: string, edit: (sql: string) => string = (s) => s): Promise<void> {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  } & Record<string, unknown>;
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`No migration ${tag}`);
  const dir = mkdtempSync(join(tmpdir(), 'cs-mig-'));
  try {
    mkdirSync(join(dir, 'meta'));
    writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: [entry] }));
    writeFileSync(join(dir, `${tag}.sql`), edit(readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8')));
    const { db, close } = createDb(url);
    try {
      await migrate(db, { migrationsFolder: dir });
    } finally {
      await close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
