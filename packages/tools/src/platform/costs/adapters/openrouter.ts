import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

const schema = z.object({ data: z.object({ total_credits: z.number(), total_usage: z.number() }) });

export const openrouterAdapter: CostAdapter = async (env, fetchImpl) => {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return { status: 'not_configured', kind: 'balance' };
  const r = await getValidated(fetchImpl, 'balance', 'https://openrouter.ai/api/v1/credits', { Authorization: `Bearer ${key}` }, schema);
  if (!r.ok) return r.reading;
  return { status: 'ok', kind: 'balance', amountUsd: r.data.data.total_credits - r.data.data.total_usage };
};
