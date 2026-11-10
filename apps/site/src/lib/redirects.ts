/** Moved addresses, served by `next.config.ts` `redirects()`. A plain `source` also matches `/pricing?x=1`. */
export const REDIRECTS = [{ source: '/pricing', destination: '/agencies/pricing', permanent: true }] as const;
