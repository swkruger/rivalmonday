import { describe, expect, it } from 'vitest';
import { healthStatuses, type RawHealth } from './system-health';

const NOW = new Date('2026-10-20T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 3_600_000;
const raw = (over: Partial<RawHealth> = {}): RawHealth => ({
  lastHeartbeatAt: ago(MIN), queues: [], vendors: [], lastOkVendorCallAt: ago(HOUR), lastOkCaptureAt: ago(HOUR), sentryUrl: null, ...over,
});
const q = (over: Partial<RawHealth['queues'][number]> = {}) => ({ name: 'brief-pdf', queued: 0, active: 0, failed24h: 0, oldestQueuedAt: null, ...over });
const v = (over: Partial<RawHealth['vendors'][number]> = {}) => ({ vendor: 'dataforseo', calls24h: 10, errors24h: 0, lastOkAt: ago(HOUR), ...over });

describe('healthStatuses', () => {
  it('worker: ok to 11 min, warn past 11, down past 30 min or never', () => {
    const s = (ms: number | null) => healthStatuses(NOW, raw({ lastHeartbeatAt: ms === null ? null : ago(ms) })).worker.status;
    expect(s(11 * MIN)).toBe('ok');
    expect(s(11 * MIN + 1000)).toBe('warn');
    expect(s(30 * MIN)).toBe('warn');
    expect(s(30 * MIN + 1000)).toBe('down');
    expect(s(null)).toBe('down');
    expect(healthStatuses(NOW, raw({ lastHeartbeatAt: null })).worker.lastHeartbeatAt).toBeNull();
  });

  it('queues: warn past 30 min oldest or any failure, down past 2 h oldest', () => {
    const s = (over: Partial<RawHealth['queues'][number]>) => healthStatuses(NOW, raw({ queues: [q(over)] })).queues[0]!;
    expect(s({}).status).toBe('ok');
    expect(s({ queued: 1, oldestQueuedAt: ago(30 * MIN) }).status).toBe('ok');
    expect(s({ queued: 1, oldestQueuedAt: ago(31 * MIN) }).status).toBe('warn');
    expect(s({ queued: 1, oldestQueuedAt: ago(2 * HOUR) }).status).toBe('warn');
    expect(s({ queued: 1, oldestQueuedAt: ago(2 * HOUR + 1000) }).status).toBe('down');
    expect(s({ failed24h: 1 }).status).toBe('warn');
    expect(s({ queued: 1, oldestQueuedAt: ago(90 * MIN) }).oldestQueuedAgeS).toBe(5400);
    expect(s({}).oldestQueuedAgeS).toBeNull();
  });

  it('vendors: error rate 0.2 warns, 0.5 is down, no ok call with calls is down', () => {
    const s = (over: Partial<RawHealth['vendors'][number]>) => healthStatuses(NOW, raw({ vendors: [v(over)] })).vendors[0]!;
    expect(s({ calls24h: 10, errors24h: 1 }).status).toBe('ok');
    expect(s({ calls24h: 10, errors24h: 2 }).status).toBe('warn');
    expect(s({ calls24h: 10, errors24h: 5 }).status).toBe('down');
    expect(s({ calls24h: 4, errors24h: 4, lastOkAt: null }).status).toBe('down');
    expect(s({ calls24h: 3, errors24h: 0, lastOkAt: null }).status).toBe('down');
    expect(s({ calls24h: 0, errors24h: 0, lastOkAt: null }).status).toBe('ok');
    expect(s({ calls24h: 0, errors24h: 0 }).calls24h).toBe(0);
  });

  it('sources: warn past 26 h, down past 72 h or none', () => {
    const s = (kind: 'vendor_call' | 'capture', ms: number | null) =>
      healthStatuses(NOW, raw(kind === 'capture' ? { lastOkCaptureAt: ms === null ? null : ago(ms) } : { lastOkVendorCallAt: ms === null ? null : ago(ms) })).sources.find((x) => x.kind === kind)!;
    expect(s('capture', 26 * HOUR).status).toBe('ok');
    expect(s('capture', 26 * HOUR + 1000).status).toBe('warn');
    expect(s('capture', 72 * HOUR).status).toBe('warn');
    expect(s('capture', 72 * HOUR + 1000).status).toBe('down');
    expect(s('vendor_call', null).status).toBe('down');
    expect(s('vendor_call', null).lastOkAt).toBeNull();
  });

  it('empty input: worker down, no queues or vendors, no NaN', () => {
    const out = healthStatuses(NOW, { lastHeartbeatAt: null, queues: [], vendors: [], lastOkVendorCallAt: null, lastOkCaptureAt: null, sentryUrl: null });
    expect(out.worker.status).toBe('down');
    expect(out.queues).toEqual([]);
    expect(out.vendors).toEqual([]);
    expect(out.generatedAt).toBe(NOW.toISOString());
    expect(out.sentryUrl).toBeNull();
    expect(JSON.stringify(out)).not.toContain('null,null,NaN');
  });
});
