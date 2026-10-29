import { z } from 'zod';
import json from '../../content/sample-brief.json';

// Skip zod's `new Function` probe: the CSP has no unsafe-eval, so the probe would be reported as a violation.
z.config({ jitless: true });

/**
 * Zod mirror of `packages/demo/src/site-export/types.ts` (`SampleBriefData`). The site never imports `@cs/demo`
 * (import boundary), so the shape is restated here and the committed JSON is parsed against it at module load.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tier = z.enum(['top', 'watch', 'minor']);

const evidenceSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('snapshot'), rivalId: z.string(), url: z.string(), capturedAt: z.string(), title: z.string(), before: z.array(z.string()), after: z.array(z.string()), changed: z.number().int().min(0) }),
  z.object({
    id: z.string(), kind: z.literal('reviews'), rivalId: z.string(), from: z.string(), to: z.string(), count: z.number().int().min(0),
    reviews: z.array(z.object({ author: z.string(), rating: z.number().min(0).max(5), date: z.string(), text: z.string() })),
  }),
  z.object({ id: z.string(), kind: z.literal('ad'), rivalId: z.string(), platform: z.enum(['google', 'meta']), firstSeen: z.string(), headline: z.string(), body: z.string() }),
  z.object({ id: z.string(), kind: z.literal('rank'), keyword: z.string(), weekOf: day, summary: z.string() }),
]);

export const sampleBriefSchema = z.object({
  version: z.literal(1),
  label: z.literal('Sample data'),
  business: z.object({ name: z.string(), vertical: z.string(), area: z.string() }),
  weekOf: day,
  rivals: z.array(z.object({ id: z.string(), name: z.string(), tier })),
  items: z.array(z.object({
    id: z.string(), rivalId: z.string().nullable(), kind: z.enum(['website', 'reviews', 'ads', 'rank', 'listing']),
    headline: z.string(), whatChanged: z.string(), whyItMatters: z.string(), recommendedAction: z.string(), evidenceIds: z.array(z.string()),
  })),
  evidence: z.record(z.string(), evidenceSchema),
  rankGrid: z.object({
    keyword: z.string(),
    size: z.number().int().positive(),
    weeks: z.array(z.object({ weekOf: day, you: z.array(z.number().nullable()), leaderRivalId: z.string().nullable() })),
  }),
});

export type SampleBriefData = z.infer<typeof sampleBriefSchema>;
export type SampleEvidence = SampleBriefData['evidence'][string];
export type SampleItem = SampleBriefData['items'][number];

export const SAMPLE: SampleBriefData = sampleBriefSchema.parse(json);
