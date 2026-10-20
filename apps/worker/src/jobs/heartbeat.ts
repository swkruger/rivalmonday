import { z } from 'zod';
import { defineJob } from '../jobs';
import { healthState } from '../health';
import { workerLog } from '../log';

export const heartbeatJob = defineJob({
  name: 'system-heartbeat',
  schema: z.looseObject({}),
  cron: '*/5 * * * *',
  handler: async () => {
    healthState.lastHeartbeatAt = new Date();
    workerLog.info('heartbeat');
  },
});
