import { sql } from 'drizzle-orm';
import { type Db, createDb } from '../src/client';
import { agency, client, clientCompetitor, competitor } from '../src/schema';

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
export async function truncateAll(db: Db): Promise<void> {
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
