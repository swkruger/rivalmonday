import { describe, expect, it } from 'vitest';
import { SETUP_HOLD_DAYS, startingPointClockStart } from './setup-clock';

const NOW = new Date('2026-10-16T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 864e5);
const ACTIVATED = day(3);
const CREATED = day(5);
const NONE = { competitorsDoneAt: null, ownerPickRequestedAt: null, completedAt: null, dismissedAt: null };

describe('startingPointClockStart', () => {
  it('uses activated_at, else created_at, when there is no setup row', () => {
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, null, NOW)).toEqual(ACTIVATED);
    expect(startingPointClockStart({ activatedAt: null, createdAt: CREATED }, null, NOW)).toEqual(CREATED);
  });
  it('completed setup keeps the competitors-done clock', () => {
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, { ...NONE, completedAt: day(1), competitorsDoneAt: day(2) }, NOW)).toEqual(day(2));
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, { ...NONE, completedAt: day(1), dismissedAt: day(1) }, NOW)).toEqual(day(1));
  });
  it('backfilled completed row (no competitors_done_at) keeps the activation clock', () => {
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, { ...NONE, completedAt: day(1) }, NOW)).toEqual(ACTIVATED);
    expect(startingPointClockStart({ activatedAt: null, createdAt: CREATED }, { ...NONE, completedAt: day(1) }, NOW)).toEqual(CREATED);
  });
  it('an open setup starts the clock at competitors_done_at', () => {
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, { ...NONE, competitorsDoneAt: day(1) }, NOW)).toEqual(day(1));
  });
  it('an open dismissed setup starts the clock at dismissed_at', () => {
    expect(startingPointClockStart({ activatedAt: ACTIVATED, createdAt: CREATED }, { ...NONE, dismissedAt: day(2) }, NOW)).toEqual(day(2));
  });
  it('an open setup with nothing done is not due before 14 days', () => {
    expect(startingPointClockStart({ activatedAt: day(13), createdAt: day(20) }, NONE, NOW)).toBeNull();
  });
  it('an open setup with nothing done falls back to activated_at after 14 days', () => {
    expect(SETUP_HOLD_DAYS).toBe(14);
    expect(startingPointClockStart({ activatedAt: day(14), createdAt: day(20) }, NONE, NOW)).toEqual(day(14));
    expect(startingPointClockStart({ activatedAt: null, createdAt: day(15) }, NONE, NOW)).toEqual(day(15));
  });
  it('waits for owner pick up to 14 days', () => {
    const c = { activatedAt: ACTIVATED, createdAt: CREATED };
    // Asked 3 days ago, setup already completed by staff: not started, even though completed_at is set.
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(3), completedAt: day(3) }, NOW)).toBeNull();
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(3) }, NOW)).toBeNull();
    // A dismissal does not start it either while the owner may still pick.
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(3), dismissedAt: day(2) }, NOW)).toBeNull();
    // The owner picked: starts at competitors_done_at.
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(3), completedAt: day(3), competitorsDoneAt: day(1) }, NOW)).toEqual(day(1));
    // No pick within 14 days: starts at owner_pick_requested_at + 14 d.
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(13.9), completedAt: day(13.9) }, NOW)).toBeNull();
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(14), completedAt: day(14) }, NOW)).toEqual(NOW);
    expect(startingPointClockStart(c, { ...NONE, ownerPickRequestedAt: day(20), completedAt: day(20) }, NOW)).toEqual(day(6));
  });
});
