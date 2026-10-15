import { z } from 'zod';

export const Signals = z.object({
  rating: z.number().nullable(), votes: z.number().int().nullable(),
  reviews30d: z.number().int().nullable(), reviews90d: z.number().int().nullable(), replyRate: z.number().min(0).max(1).nullable(),
  googleAdsActive: z.number().int().nullable(), googleAdsNew30d: z.number().int().nullable(), googleAccount: z.enum(['matched','possible','none']).nullable(),
  metaPage: z.enum(['matched','possible','none']).nullable(), metaAdsActive: z.number().int().nullable(),
  claimed: z.boolean().nullable(), chain: z.boolean().nullable(),
  categoryMatch: z.enum(['main','related']).nullable(), distanceKm: z.number().nullable(),
  presence: z.object({ searches: z.number().int(), appeared: z.number().int(), bestRank: z.number().int().nullable() }).nullable(),
});
export type Signals = z.infer<typeof Signals>;
export const AdMatch = z.object({ platform: z.enum(['google','meta']), accountId: z.string(), name: z.string(), strength: z.enum(['strong','weak']) });
export type AdMatch = z.infer<typeof AdMatch>;
