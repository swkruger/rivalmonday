import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

const MAX_PAGES = 3;

const schema = z.object({
  data: z.array(z.object({ results: z.array(z.object({ amount: z.string() })) })),
  has_more: z.boolean().nullish(),
  next_page: z.string().nullish(),
});

/** Month-to-date spend. `amount` is a decimal string in cents; summed in hundredths of a cent. */
export const anthropicAdapter: CostAdapter = async (env, fetchImpl, now) => {
  const key = env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { status: 'not_configured', kind: 'usage' };
  const startingAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().replace('.000Z', 'Z');
  const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  let hundredths = 0;
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({ starting_at: startingAt, bucket_width: '1d', limit: '31' });
    if (page) qs.set('page', page);
    const r = await getValidated(fetchImpl, 'usage', `https://api.anthropic.com/v1/organizations/cost_report?${qs}`, headers, schema);
    if (!r.ok) return r.reading;
    for (const bucket of r.data.data) {
      for (const res of bucket.results) {
        const cents = Number(res.amount);
        if (res.amount.trim() === '' || !Number.isFinite(cents)) return { status: 'error', kind: 'usage', error: 'bad response' };
        hundredths += Math.round(cents * 100);
      }
    }
    if (!r.data.has_more || !r.data.next_page) break;
    page = r.data.next_page;
  }
  return { status: 'ok', kind: 'usage', amountUsd: hundredths / 10000 };
};
