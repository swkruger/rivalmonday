import { createLogger } from '@cs/core/server';

/** Worker root logger; jobs derive children with job/jobId/agencyId/clientId. Plain JSON under vitest (no pretty transport thread). */
export const workerLog = createLogger(process.env.VITEST ? { pretty: false } : {}).child({ role: 'worker' });
