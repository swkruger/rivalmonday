import { competitorSource, type Db } from '@cs/db';
import { DEFAULT_SOURCE_KINDS, type SourceKind } from './kinds';

/** Creates a due-now schedule row for each given vendor source of a competitor (default: all but tripadvisor; idempotent). */
export async function ensureCompetitorSources(db: Db, competitorId: string, sources: readonly SourceKind[] = DEFAULT_SOURCE_KINDS): Promise<void> {
  await db.insert(competitorSource).values(sources.map((source) => ({ competitorId, source }))).onConflictDoNothing();
}
