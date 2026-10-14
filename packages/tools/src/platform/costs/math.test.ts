import { describe, expect, it } from 'vitest';
import {
  burnRate,
  daysLeft,
  manualMonthly,
  monthKeys,
  monthlySpend,
  serviceStatus,
  type ManualItem,
  type SnapPoint,
} from './math';

const NOW = new Date('2026-10-14T00:00:00Z');
const pt = (iso: string, amountUsd: number | null, over: Partial<SnapPoint> = {}): SnapPoint => ({
  takenAt: new Date(iso),
  status: 'ok',
  amountUsd,
  capUsd: null,
  ...over,
});

describe('burnRate', () => {
  it('ignores a top-up between two drops', () => {
    const r = burnRate(
      [pt('2026-10-10T00:00:00Z', 100), pt('2026-10-11T00:00:00Z', 90), pt('2026-10-12T00:00:00Z', 200), pt('2026-10-13T00:00:00Z', 180)],
      NOW,
    );
    expect(r).toBeCloseTo(30 / 3, 6);
  });
  it('null with one point / zero drops / span under 12h', () => {
    expect(burnRate([pt('2026-10-12T00:00:00Z', 100)], NOW)).toBeNull();
    expect(burnRate([pt('2026-10-11T00:00:00Z', 100), pt('2026-10-12T00:00:00Z', 100)], NOW)).toBeNull();
    expect(burnRate([pt('2026-10-12T00:00:00Z', 100), pt('2026-10-12T10:00:00Z', 90)], NOW)).toBeNull();
  });
  it('only uses the last 14 days', () => {
    const r = burnRate(
      [pt('2026-09-01T00:00:00Z', 1000), pt('2026-09-02T00:00:00Z', 500), pt('2026-10-10T00:00:00Z', 100), pt('2026-10-12T00:00:00Z', 80)],
      NOW,
    );
    expect(r).toBeCloseTo(10, 6);
  });
  it('skips non-ok and null-amount points', () => {
    const r = burnRate(
      [pt('2026-10-10T00:00:00Z', 100), pt('2026-10-11T00:00:00Z', null), pt('2026-10-11T12:00:00Z', 0, { status: 'error' }), pt('2026-10-12T00:00:00Z', 80)],
      NOW,
    );
    expect(r).toBeCloseTo(10, 6);
  });
});

describe('daysLeft', () => {
  it('floors; null on a zero rate', () => {
    expect(daysLeft(100, 30)).toBe(3);
    expect(daysLeft(100, 0)).toBeNull();
    expect(daysLeft(100, null)).toBeNull();
  });
});

describe('serviceStatus', () => {
  const base = { enabled: true, configured: true, kind: 'balance' as const, latest: pt('2026-10-13T00:00:00Z', 50), lowThresholdUsd: null, warnDays: 7, rate: null };
  it('disabled > not_configured > error > unavailable precedence', () => {
    const err = pt('2026-10-13T00:00:00Z', null, { status: 'error' });
    expect(serviceStatus({ ...base, enabled: false, configured: false, latest: err })).toBe('disabled');
    expect(serviceStatus({ ...base, configured: false, latest: err })).toBe('not_configured');
    expect(serviceStatus({ ...base, latest: null })).toBe('not_configured');
    expect(serviceStatus({ ...base, latest: err })).toBe('error');
    expect(serviceStatus({ ...base, latest: pt('2026-10-13T00:00:00Z', null, { status: 'unavailable' }) })).toBe('unavailable');
    expect(serviceStatus(base)).toBe('ok');
  });
  it('low by threshold', () => {
    expect(serviceStatus({ ...base, lowThresholdUsd: 60 })).toBe('low');
    expect(serviceStatus({ ...base, lowThresholdUsd: 40 })).toBe('ok');
  });
  it('low by days left', () => {
    expect(serviceStatus({ ...base, rate: 10 })).toBe('low'); // 5 days <= 7
    expect(serviceStatus({ ...base, rate: 1 })).toBe('ok');
  });
  it('apify low when cap - usage < threshold', () => {
    const latest = pt('2026-10-13T00:00:00Z', 45, { capUsd: 50 });
    expect(serviceStatus({ ...base, kind: 'usage', latest, lowThresholdUsd: 10 })).toBe('low');
    expect(serviceStatus({ ...base, kind: 'usage', latest, lowThresholdUsd: 2 })).toBe('ok');
  });
  it('anthropic usage without cap never low', () => {
    expect(serviceStatus({ ...base, kind: 'usage', lowThresholdUsd: 1000, rate: 100 })).toBe('ok');
  });
});

describe('monthlySpend', () => {
  it('usage takes the latest point in the month', () => {
    const pts = [pt('2026-09-30T00:00:00Z', 99), pt('2026-10-02T00:00:00Z', 5), pt('2026-10-09T00:00:00Z', 12), pt('2026-10-10T00:00:00Z', 1, { status: 'error' })];
    expect(monthlySpend('usage', pts, '2026-10')).toBe(12);
    expect(monthlySpend('usage', pts, '2026-08')).toBe(0);
  });
  it('balance month across a top-up counts only drops', () => {
    const pts = [pt('2026-10-01T00:00:00Z', 100), pt('2026-10-05T00:00:00Z', 80), pt('2026-10-06T00:00:00Z', 300), pt('2026-10-20T00:00:00Z', 250)];
    expect(monthlySpend('balance', pts, '2026-10')).toBe(70);
    expect(monthlySpend('balance', [pts[0]!], '2026-10')).toBe(0);
  });
});

describe('manualMonthly', () => {
  const item = (o: Partial<ManualItem>): ManualItem => ({ kind: 'recurring', amountUsd: 120, period: 'monthly', startsOn: '2026-01-01', endsOn: null, archivedAt: null, ...o });
  it('yearly divided by 12', () => {
    expect(manualMonthly([item({ period: 'yearly', amountUsd: 100 })], '2026-10')).toBe(8.33);
  });
  it('recurring that started on the 20th counts in full', () => {
    expect(manualMonthly([item({ startsOn: '2026-10-20' })], '2026-10')).toBe(120);
    expect(manualMonthly([item({ startsOn: '2026-11-01' })], '2026-10')).toBe(0);
  });
  it('ended last month excluded', () => {
    expect(manualMonthly([item({ endsOn: '2026-09-30' })], '2026-10')).toBe(0);
    expect(manualMonthly([item({ endsOn: '2026-10-01' })], '2026-10')).toBe(120);
  });
  it('one-off in or out of month', () => {
    const o = (startsOn: string) => item({ kind: 'one_off', period: null, amountUsd: 50, startsOn });
    expect(manualMonthly([o('2026-10-31')], '2026-10')).toBe(50);
    expect(manualMonthly([o('2026-11-01')], '2026-10')).toBe(0);
    expect(manualMonthly([o('2026-09-30')], '2026-10')).toBe(0);
  });
  it('archived still counted for history', () => {
    expect(manualMonthly([item({ archivedAt: new Date('2026-10-05T00:00:00Z') })], '2026-10')).toBe(120);
  });
  it('archived open-ended recurring counts up to and including its archive month, then stops', () => {
    const a = item({ archivedAt: new Date('2026-10-05T00:00:00Z') });
    expect(manualMonthly([a], '2026-09')).toBe(120);
    expect(manualMonthly([a], '2026-10')).toBe(120);
    expect(manualMonthly([a], '2026-11')).toBe(0);
    expect(manualMonthly([a], '2027-03')).toBe(0);
  });
  it('recurring archived before its start counts in no month', () => {
    const a = item({ startsOn: '2026-12-01', archivedAt: new Date('2026-10-05T00:00:00Z') });
    for (const m of ['2026-10', '2026-11', '2026-12', '2027-01']) expect(manualMonthly([a], m), m).toBe(0);
  });
  it('archived recurring whose endsOn is earlier than the archive date stops at endsOn', () => {
    const a = item({ endsOn: '2026-08-15', archivedAt: new Date('2026-10-05T00:00:00Z') });
    expect(manualMonthly([a], '2026-08')).toBe(120);
    expect(manualMonthly([a], '2026-09')).toBe(0);
    expect(manualMonthly([a], '2026-10')).toBe(0);
  });
  it('archived one-off still counts in its own month', () => {
    const a = item({ kind: 'one_off', period: null, amountUsd: 50, startsOn: '2026-09-10', archivedAt: new Date('2026-09-12T00:00:00Z') });
    expect(manualMonthly([a], '2026-09')).toBe(50);
    expect(manualMonthly([a], '2026-10')).toBe(0);
  });
});

describe('monthKeys', () => {
  it('monthKeys(2026-01-15, 6)', () => {
    expect(monthKeys(new Date('2026-01-15T00:00:00Z'), 6)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
  });
});
