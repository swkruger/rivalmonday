import { competitorSource, type Db } from '@cs/db';
import { SOURCE_KINDS, type SourceKind } from './kinds';

/** Creates a due-now schedule row for each given vendor source of a competitor (default: all; idempotent). */
export async function ensureCompetitorSources(db: Db, competitorId: string, sources: readonly SourceKind[] = SOURCE_KINDS): Promise<void> {
  await db.insert(competitorSource).values(sources.map((source) => ({ competitorId, source }))).onConflictDoNothing();
}
