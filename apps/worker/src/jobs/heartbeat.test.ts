import { describe, expect, it } from 'vitest';
import { heartbeatJob } from './heartbeat';

describe('heartbeatJob', () => {
  it('is importable without side effects and has the expected name and schedule', () => {
    expect(heartbeatJob.name).toBe('system-heartbeat');
    expect(heartbeatJob.cron).toBe('*/5 * * * *');
  });

  it('accepts an empty payload', () => {
    expect(() => heartbeatJob.schema.parse({})).not.toThrow();
  });
});
