import { z } from 'zod';
import type { CostAdapter } from '../types';
import { getValidated } from './util';

// Always production: DATAFORSEO_BASE_URL may point at the sandbox, whose balance is not the real one.
const URL_ = 'https://api.dataforseo.com/v3/appendix/user_data';

const schema = z.object({
  status_code: z.number(),
  tasks: z
    .array(
      z.object({
        status_code: z.number(),
        result: z.array(z.object({ money: z.object({ balance: z.number() }) })).nullish(),
      }),
    )
    .default([]),
});

export const dataforseoAdapter: CostAdapter = async (env, fetchImpl) => {
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = env;
  if (!login || !password) return { status: 'not_configured', kind: 'balance' };
  const auth = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
  const r = await getValidated(fetchImpl, 'balance', URL_, { Authorization: auth }, schema);
  if (!r.ok) return r.reading;
  const { status_code, tasks } = r.data;
  const task = tasks[0];
  if (status_code !== 20000) return { status: 'error', kind: 'balance', error: `task ${status_code}` };
  if (!task) return { status: 'error', kind: 'balance', error: 'bad response' };
  if (task.status_code !== 20000) return { status: 'error', kind: 'balance', error: `task ${task.status_code}` };
  const money = task.result?.[0]?.money;
  if (!money) return { status: 'error', kind: 'balance', error: 'bad response' };
  return { status: 'ok', kind: 'balance', amountUsd: money.balance };
};
