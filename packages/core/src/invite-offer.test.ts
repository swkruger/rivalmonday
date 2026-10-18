import { describe, expect, it } from 'vitest';
import { pilotLinkRefusal } from './invite-offer';

const now = new Date('2026-10-17T12:00:00Z');
const at = (s: string) => new Date(s);

describe('pilotLinkRefusal', () => {
  it('refuses a pilot end that has already passed', () => {
    expect(pilotLinkRefusal(at('2026-10-16T23:59:59Z'), at('2026-10-31T12:00:00Z'), now)).toMatch(/already passed/);
  });
  it('refuses a pilot ending on the expiry day (end-of-day instant is later than the expiry)', () => {
    const why = pilotLinkRefusal(at('2026-10-31T23:59:59Z'), at('2026-10-31T12:00:00Z'), now);
    expect(why).toContain('after this link expires on 2026-10-31');
  });
  it('refuses a pilot ending before the expiry day', () => {
    expect(pilotLinkRefusal(at('2026-10-25T23:59:59Z'), at('2026-10-31T12:00:00Z'), now)).toContain('2026-10-31');
  });
  it('accepts a pilot ending the day after expiry', () => {
    expect(pilotLinkRefusal(at('2026-11-01T23:59:59Z'), at('2026-10-31T12:00:00Z'), now)).toBeNull();
  });
  it('compares UTC days at the boundary', () => {
    expect(pilotLinkRefusal(at('2026-11-01T23:59:59Z'), at('2026-10-31T23:30:00Z'), now)).toBeNull();
  });
});
