import { siteEnv } from '../src/lib/env';

/** Single source of every number the site's copy shows (spec § 7.6). 17c's /pricing reuses it. */
export const PRICING = {
  agency: { pilot: 'free', monthlyUsd: 229, seatsIncluded: 3, extraSeatUsd: 99, trialDays: 30 },
  business: { pilot: 'free', monthlyUsd: siteEnv.clientPriceUsd },
} as const;
