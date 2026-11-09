import { describe, expect, it } from 'vitest';
import { QUIET_SUMMARY } from './generate';
import { countSummary, finalBriefSummary, majorSummary } from './summary';

const b = { kind: 'standard' as const, summary: 'Smith HVAC cut a price and Bright Air launched ads.' };
describe('finalBriefSummary (Phase 4a binding obligation)', () => {
  it('keeps the verified summary when no item was dropped', () => {
    expect(finalBriefSummary(b, [{ status: 'active' }, { status: 'active' }], 0)).toEqual(b);
  });
  it('replaces it with the count line once any item was dropped', () => {
    expect(finalBriefSummary(b, [{ status: 'active' }, { status: 'dropped' }], 0)).toEqual({ kind: 'standard', summary: countSummary(1) });
    expect(countSummary(1)).toBe('1 competitor update this week.');
    expect(countSummary(2)).toBe('2 competitor updates this week.');
  });
  it('turns a brief with no active item into a quiet one', () => {
    expect(finalBriefSummary(b, [{ status: 'dropped' }], 0)).toEqual({ kind: 'quiet', summary: QUIET_SUMMARY });
    expect(finalBriefSummary({ kind: 'quiet', summary: QUIET_SUMMARY }, [], 0)).toEqual({ kind: 'quiet', summary: QUIET_SUMMARY });
  });
  it('never turns a starting point quiet or rewrites its summary (12b Q3)', () => {
    const sp = { kind: 'starting_point' as const, summary: 'Where A1 HVAC stands against the 2 rivals we now watch.' };
    expect(finalBriefSummary(sp, [{ status: 'dropped' }], 0)).toEqual(sp);
    expect(finalBriefSummary(sp, [{ status: 'active' }, { status: 'dropped' }], 0)).toEqual(sp);
  });
  it('starting point unchanged even with live Major changes', () => {
    const sp = { kind: 'starting_point' as const, summary: 'Where A1 HVAC stands.' };
    expect(finalBriefSummary(sp, [{ status: 'dropped' }], 3)).toEqual(sp);
  });
  it('no active item but live Major changes: standard with the major summary', () => {
    expect(finalBriefSummary(b, [{ status: 'dropped' }], 2)).toEqual({ kind: 'standard', summary: '2 major competitor changes this week.' });
    expect(finalBriefSummary({ kind: 'quiet', summary: QUIET_SUMMARY }, [], 1)).toEqual({ kind: 'standard', summary: '1 major competitor change this week.' });
    expect(majorSummary(1)).toBe('1 major competitor change this week.');
    expect(majorSummary(3)).toBe('3 major competitor changes this week.');
  });
  it('a dropped item with an active one left still uses the count line; Majors do not change it', () => {
    expect(finalBriefSummary(b, [{ status: 'active' }, { status: 'dropped' }], 2)).toEqual({ kind: 'standard', summary: countSummary(1) });
  });
});
