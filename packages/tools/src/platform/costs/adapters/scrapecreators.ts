import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

const schema = z.object({ creditCount: z.number() });

/** Credits only; the USD rate is applied in snapshotAll. */
export const scrapecreatorsAdapter: CostAdapter = async (env, fetchImpl) => {
  const key = env.SCRAPECREATORS_API_KEY;
  if (!key) return { status: 'not_configured', kind: 'balance' };
  const r = await getValidated(fetchImpl, 'balance', 'https://api.scrapecreators.com/v1/credit-balance', { 'x-api-key': key }, schema);
  if (!r.ok) return r.reading;
  return { status: 'ok', kind: 'balance', units: r.data.creditCount };
};
