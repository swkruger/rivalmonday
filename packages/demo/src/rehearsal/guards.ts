import { agency, databaseNameOf, type Db } from '@cs/db';
import { asc, notLike } from 'drizzle-orm';

/** Every agency the rehearsal creates is named `Rehearsal …`; teardown and the guards rely on it. */
export const REHEARSAL_AGENCY_PREFIX = 'Rehearsal ';

/** `<hostname>/<database>` of a postgres URL: what the owner types after `--confirm-db`. */
export function dbIdentity(url: string): string {
  const name = databaseNameOf(url);
  return `${new URL(url).hostname}/${name}`;
}

export function assertConfirmDb(url: string, confirmDb: string | undefined): void {
  const expected = dbIdentity(url);
  if (confirmDb?.trim() !== expected) {
    throw new Error(`Refusing: --confirm-db must be exactly "${expected}" (the host/database this command would write to)${confirmDb ? `, got "${confirmDb}"` : ''}`);
  }
}

/** The rehearsal never writes to a test database (its tables are wiped by every test run). */
export function assertNotTestDatabase(url: string): void {
  const name = databaseNameOf(url);
  if (name.endsWith('_test')) throw new Error(`Refusing: database "${name}" is a test database (name ends in _test)`);
}

/** A database holding any agency not named `Rehearsal …` is not a rehearsal database (production, dev, demo). */
export async function assertOnlyRehearsalAgencies(db: Db): Promise<void> {
  const others = await db.select({ name: agency.name }).from(agency).where(notLike(agency.name, `${REHEARSAL_AGENCY_PREFIX}%`)).orderBy(asc(agency.name)).limit(5);
  if (others.length > 0) {
    throw new Error(`Refusing: this database has agencies that are not a rehearsal agency (${others.map((o) => `"${o.name}"`).join(', ')}). Run the rehearsal only on the staging branch.`);
  }
}

export interface RehearsalGuardOptions {
  /** Required for seed and teardown (`<host>/<db>`); approve and fault rely on the other two checks. */
  confirmDb?: string;
  requireConfirm?: boolean;
  /** Tests only: the shared test database ends in `_test`. The CLI never sets it. */
  allowTestDatabase?: boolean;
}

/** Spec 7c2 Task 10b: every rehearsal command that writes runs this first, before touching a row. */
export async function guardRehearsalWrite(db: Db, url: string, opts: RehearsalGuardOptions): Promise<void> {
  if (!opts.allowTestDatabase) assertNotTestDatabase(url);
  if (opts.requireConfirm !== false) assertConfirmDb(url, opts.confirmDb);
  await assertOnlyRehearsalAgencies(db);
}
