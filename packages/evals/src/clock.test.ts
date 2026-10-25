import { afterEach, describe, expect, it } from 'vitest';
import { pinClock } from './clock';

const RealDate = Date;
let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

describe('pinClock', () => {
  it('pins new Date() and Date.now() to the instant, advancing with real time', async () => {
    undo = pinClock('2026-10-15T12:00:00.000Z');
    const a = Date.now();
    expect(Math.abs(a - RealDate.parse('2026-10-15T12:00:00.000Z'))).toBeLessThan(1000);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-15');
    await new Promise((r) => setTimeout(r, 20));
    expect(Date.now()).toBeGreaterThan(a);
  });

  it('leaves argument dates, statics and instanceof intact', () => {
    undo = pinClock('2026-10-15T12:00:00.000Z');
    expect(new Date('2020-01-02T00:00:00Z').toISOString()).toBe('2020-01-02T00:00:00.000Z');
    expect(new Date(0).getTime()).toBe(0);
    expect(Date.UTC(2020, 0, 1)).toBe(RealDate.UTC(2020, 0, 1));
    expect(new Date()).toBeInstanceOf(RealDate);
    expect(new RealDate()).toBeInstanceOf(Date);
    expect(typeof Date()).toBe('string');
  });

  it('uninstall restores the real Date', () => {
    pinClock('2001-01-01T00:00:00Z')();
    expect(Date).toBe(RealDate);
    expect(new Date().getUTCFullYear()).toBeGreaterThan(2001);
  });

  it('rejects an invalid instant', () => {
    expect(() => pinClock('nope')).toThrow(/invalid/);
  });
});
