export type RivalTier = 'top' | 'watch' | 'minor';
export interface SampleBriefData {
  version: 1; label: 'Sample data';
  business: { name: string; vertical: string; area: string };
  weekOf: string; // YYYY-MM-DD
  rivals: { id: string; name: string; tier: RivalTier }[];
  items: { id: string; rivalId: string | null; kind: 'website' | 'reviews' | 'ads' | 'rank' | 'listing'; headline: string; whatChanged: string; whyItMatters: string; recommendedAction: string; evidenceIds: string[] }[];
  evidence: Record<string, SampleEvidence>;
  rankGrid: { keyword: string; size: number; weeks: { weekOf: string; you: (number | null)[]; leaderRivalId: string | null }[] };
}
export type SampleEvidence =
  | { id: string; kind: 'snapshot'; rivalId: string; url: string; capturedAt: string; title: string; before: string[]; after: string[]; changed: number }
  | { id: string; kind: 'reviews'; rivalId: string; from: string; to: string; count: number; reviews: { author: string; rating: number; date: string; text: string }[] }
  | { id: string; kind: 'ad'; rivalId: string; platform: 'google' | 'meta'; firstSeen: string; headline: string; body: string }
  | { id: string; kind: 'rank'; keyword: string; weekOf: string; summary: string };
