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

/** Truncates every table in the public schema (except drizzle bookkeeping, which lives in schema "drizzle"). */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
      END LOOP;
    END $$;`);
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
