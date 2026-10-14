import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

const schema = z.object({
  data: z.object({
    current: z.object({ monthlyUsageUsd: z.number() }),
    limits: z.object({ maxMonthlyUsageUsd: z.number() }),
  }),
});

export const apifyAdapter: CostAdapter = async (env, fetchImpl) => {
  const token = env.APIFY_TOKEN;
  if (!token) return { status: 'not_configured', kind: 'usage' };
  const r = await getValidated(fetchImpl, 'usage', 'https://api.apify.com/v2/users/me/limits', { Authorization: `Bearer ${token}` }, schema);
  if (!r.ok) return r.reading;
  return { status: 'ok', kind: 'usage', amountUsd: r.data.data.current.monthlyUsageUsd, capUsd: r.data.data.limits.maxMonthlyUsageUsd };
};
