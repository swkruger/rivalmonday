export const SOURCE_KINDS = ['gbp', 'reviews', 'ads_google', 'ads_meta', 'jobs'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
