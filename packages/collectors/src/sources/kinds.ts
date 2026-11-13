export const SOURCE_KINDS = ['gbp', 'reviews', 'ads_google', 'ads_meta', 'jobs', 'gbp_posts', 'tripadvisor', 'social'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
/** What `ensureCompetitorSources` creates by default: `tripadvisor` rows exist only for competitors an opted-in client tracks (`syncTripadvisorSources`, P8); `social` rows are created only for opted-in packs (a later 18e task). */
export const DEFAULT_SOURCE_KINDS: readonly SourceKind[] = SOURCE_KINDS.filter((k) => k !== 'tripadvisor' && k !== 'social');
