// Repo-relative paths from the claims ledger (rows src-<slug>). Kept apart from sources.ts: that module reaches
// the client bundle through the page registry, and the bundle check refuses server-package paths.
export const SOURCE_VERIFIED_IN: Record<string, readonly string[]> = {
  'competitor-websites': ['packages/collectors/src/web/robots.ts', 'packages/collectors/src/schedule/due-pages.ts'],
  'google-reviews': ['packages/collectors/src/reviews/upsert.ts', 'packages/collectors/src/sources/due.ts'],
  'google-business-profile': ['packages/collectors/src/gbp/collect-gbp.ts'],
  ads: ['packages/collectors/src/ads/meta.ts', 'packages/collectors/src/ads/google.ts'],
  'local-map-rankings': ['packages/collectors/src/rankings/settings.ts'],
  'job-postings': ['packages/collectors/src/jobs/post.ts', 'packages/collectors/src/jobs/collect.ts'],
};
