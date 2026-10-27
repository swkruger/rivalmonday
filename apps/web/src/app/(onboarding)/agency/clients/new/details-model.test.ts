import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, draftErrors, fillBlanks, locationOf, parseUsAddress } from './details-model';

const ok = { ...EMPTY_DRAFT, name: 'Cool Breeze', contactName: 'Maria Alvarez', phone: '(512) 555-0187', email: 'maria@coolbreezeac.com' };

describe('client details draft', () => {
  it('needs a name, contact, phone and email; the address is optional', () => {
    expect(draftErrors(ok)).toEqual({});
    expect(Object.keys(draftErrors(EMPTY_DRAFT)).sort()).toEqual(['contactName', 'email', 'name', 'phone']);
    expect(draftErrors({ ...ok, phone: '12' }).phone).toMatch(/US phone number/);
    expect(draftErrors({ ...ok, email: 'maria' }).email).toMatch(/valid email/);
  });

  it('an address is all or nothing: street, city, state and a 5-digit ZIP', () => {
    expect(Object.keys(draftErrors({ ...ok, city: 'Round Rock' })).sort()).toEqual(['line1', 'postalCode', 'region']);
    expect(draftErrors({ ...ok, line1: '1 Main St', city: 'Round Rock', region: 'TX', postalCode: '78681' })).toEqual({});
    expect(draftErrors({ ...ok, line1: '1 Main St', city: 'Round Rock', region: 'TX', postalCode: '786' }).postalCode).toMatch(/5-digit/);
  });

  it('splits a US address and ignores anything else', () => {
    expect(parseUsAddress('1801 Sam Bass Rd, Round Rock, TX 78681')).toEqual({ line1: '1801 Sam Bass Rd', city: 'Round Rock', region: 'TX', postalCode: '78681' });
    expect(parseUsAddress('1801 Sam Bass Rd, Round Rock, TX 78681, USA')?.city).toBe('Round Rock');
    expect(parseUsAddress('Service area business')).toBeNull();
    expect(parseUsAddress(null)).toBeNull();
  });

  it('a picked listing fills only the blank phone and address fields', () => {
    const place = { phone: '+1512-555-0187', address: '1801 Sam Bass Rd, Round Rock, TX 78681' };
    expect(fillBlanks(EMPTY_DRAFT, place)).toMatchObject({ phone: '(512) 555-0187', line1: '1801 Sam Bass Rd', city: 'Round Rock', region: 'TX', postalCode: '78681' });
    const typed = fillBlanks({ ...EMPTY_DRAFT, phone: '(404) 555-0100', city: 'Austin' }, place);
    expect(typed).toMatchObject({ phone: '(404) 555-0100', city: 'Austin', line1: '1801 Sam Bass Rd' });
    expect(fillBlanks(EMPTY_DRAFT, { phone: 'call us', address: null })).toEqual(EMPTY_DRAFT);
  });

  it('City or ZIP starts from the address', () => {
    expect(locationOf({ ...ok, city: 'Round Rock', region: 'TX', postalCode: '78681' })).toBe('Round Rock, TX');
    expect(locationOf({ ...ok, postalCode: '78681' })).toBe('78681');
    expect(locationOf(ok)).toBe('');
  });
});
