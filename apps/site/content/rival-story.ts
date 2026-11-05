import { CLIENT_VIEW } from './client-view';
import { SAMPLE } from '../src/sample/schema';

// Kept apart from `home.ts` on purpose: this imports the sample data, and `home.ts` is imported by layout-wide client components.

export interface RivalStoryMove {
  title: string;
  date: string;
  evidence: string;
}

/** The sample's alerts, oldest first. Website captures (kind `snapshot`) are dropped unless website monitoring is live. */
export function rivalStoryMoves(live: boolean): RivalStoryMove[] {
  return [...CLIENT_VIEW.alerts]
    .filter((a) => live || SAMPLE.evidence[a.evidence]?.kind !== 'snapshot')
    .sort((a, b) => a.date.localeCompare(b.date));
}
