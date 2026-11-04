import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rows: [] as unknown[],
  held: false,
  rowGate: null as Promise<void> | null,
  holdGate: null as Promise<void> | null,
  started: [] as string[],
}));
vi.mock('server-only', () => ({}));
vi.mock('@cs/billing', () => ({
  isOnHold: async () => {
    m.started.push('hold');
    await m.holdGate;
    return m.held;
  },
}));
vi.mock('@/server/db', () => ({
  dbs: () => ({
    service: {
      select: () => ({
        from: () => ({
          where: async () => {
            m.started.push('row');
            await m.rowGate;
            return m.rows;
          },
        }),
      }),
    },
  }),
}));
vi.mock('@/server/env', () => ({ webEnv: () => ({ supportReplyTo: 'help@example.test' }) }));

const AGENCY = '11111111-1111-4111-8111-111111111111';
const load = async () => (await import('./billing-state')).billingSnapshotOf(AGENCY);

beforeEach(() => {
  m.rows = [];
  m.held = false;
  m.rowGate = null;
  m.holdGate = null;
  m.started = [];
});

describe('billingSnapshotOf', () => {
  it('on hold with a billing row: carries state, trial end, and the hold flag', async () => {
    m.rows = [{ state: 'active', trialEndsAt: new Date('2026-12-01T00:00:00Z'), pastDueSince: null }];
    m.held = true;
    expect(await load()).toEqual({ state: 'active', trialEndsAt: '2026-12-01T00:00:00.000Z', pausesOn: null, onHold: true, supportEmail: 'help@example.test' });
  });

  it('past_due: pausesOn is past-due start + 7 days', async () => {
    m.rows = [{ state: 'past_due', trialEndsAt: null, pastDueSince: new Date('2026-11-01T00:00:00Z') }];
    expect((await load()).pausesOn).toBe('2026-11-08T00:00:00.000Z');
  });

  it('no billing row: a pilot, no trial, not held', async () => {
    expect(await load()).toEqual({ state: 'pilot', trialEndsAt: null, pausesOn: null, onHold: false, supportEmail: 'help@example.test' });
  });

  it('starts the billing read and the hold read before either resolves (one stage)', async () => {
    let openRow!: () => void;
    let openHold!: () => void;
    m.rowGate = new Promise<void>((r) => (openRow = r));
    m.holdGate = new Promise<void>((r) => (openHold = r));
    const pending = load();
    await vi.waitFor(() => expect([...m.started].sort()).toEqual(['hold', 'row']));
    openRow();
    openHold();
    await pending;
  });
});
