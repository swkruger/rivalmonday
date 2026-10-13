import { describe, expect, it } from 'vitest';
import { healthFlag } from './health';

const DAY = 86_400_000;
const today = new Date('2026-10-13T00:00:00Z');
const ago = (d: number) => new Date(today.getTime() - d * DAY);

const base = {
  today,
  createdAt: ago(100),
  clientsActiveNow: 3,
  clientsActive28dAgo: 3 as number | null,
  lastSignInAt: ago(1) as Date | null,
  lastBriefSentAt: ago(1) as Date | null,
};

describe('healthFlag', () => {
  it('steady when nothing triggers', () => {
    expect(healthFlag(base)).toBe('steady');
  });
  it('at_risk: no sign-in for more than 14 days', () => {
    expect(healthFlag({ ...base, lastSignInAt: ago(20) })).toBe('at_risk');
  });
  it('boundary: sign-in exactly 14 days ago is at_risk, 13 days is not', () => {
    expect(healthFlag({ ...base, lastSignInAt: ago(14) })).toBe('at_risk');
    expect(healthFlag({ ...base, lastSignInAt: ago(13) })).toBe('steady');
  });
  it('at_risk: never signed in on a mature agency', () => {
    expect(healthFlag({ ...base, lastSignInAt: null })).toBe('at_risk');
  });
  it('at_risk: active clients fell vs 28 days ago', () => {
    expect(healthFlag({ ...base, clientsActiveNow: 2 })).toBe('at_risk');
  });
  it('at_risk wins over idle and growing', () => {
    expect(healthFlag({ ...base, lastSignInAt: ago(30), lastBriefSentAt: null, clientsActiveNow: 5 })).toBe('at_risk');
  });
  it('idle: no brief for 14 days with an active client', () => {
    expect(healthFlag({ ...base, lastBriefSentAt: ago(14) })).toBe('idle');
    expect(healthFlag({ ...base, lastBriefSentAt: ago(13) })).toBe('steady');
  });
  it('idle: never sent a brief', () => {
    expect(healthFlag({ ...base, lastBriefSentAt: null })).toBe('idle');
  });
  it('not idle without active clients', () => {
    expect(healthFlag({ ...base, clientsActiveNow: 0, clientsActive28dAgo: 0, lastBriefSentAt: null })).toBe('steady');
  });
  it('idle wins over growing', () => {
    expect(healthFlag({ ...base, clientsActiveNow: 4, lastBriefSentAt: ago(20) })).toBe('idle');
  });
  it('growing: more active clients than 28 days ago', () => {
    expect(healthFlag({ ...base, clientsActiveNow: 4 })).toBe('growing');
  });
  it('young agency (< 28d): skips comparisons and sign-in rule', () => {
    const young = { ...base, createdAt: ago(20), clientsActive28dAgo: 5, lastSignInAt: null };
    expect(healthFlag(young)).toBe('steady');
    expect(healthFlag({ ...young, clientsActiveNow: 9, clientsActive28dAgo: 0 })).toBe('steady');
  });
  it('young agency: idle applies only at age >= 14 days with an active client', () => {
    const y = { ...base, clientsActive28dAgo: null, lastBriefSentAt: null };
    expect(healthFlag({ ...y, createdAt: ago(20) })).toBe('idle');
    expect(healthFlag({ ...y, createdAt: ago(10) })).toBe('steady');
    expect(healthFlag({ ...y, createdAt: ago(20), clientsActiveNow: 0 })).toBe('steady');
  });
  it('null history skips comparisons', () => {
    expect(healthFlag({ ...base, clientsActive28dAgo: null, clientsActiveNow: 7 })).toBe('steady');
  });
});
