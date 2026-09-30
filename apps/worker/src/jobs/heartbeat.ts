import { z } from 'zod';
import { defineJob } from '../jobs';

export const heartbeatJob = defineJob({
  name: 'system-heartbeat',
  schema: z.looseObject({}),
  cron: '*/5 * * * *',
  handler: async () => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  },
});
