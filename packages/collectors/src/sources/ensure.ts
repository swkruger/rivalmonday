import { competitorSource, type Db } from '@cs/db';
import { SOURCE_KINDS } from './kinds';

/** Creates a due-now schedule row for every vendor source of a competitor (idempotent). */
export async function ensureCompetitorSources(db: Db, competitorId: string): Promise<void> {
  await db.insert(competitorSource).values(SOURCE_KINDS.map((source) => ({ competitorId, source }))).onConflictDoNothing();
}
