import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { parseBrandingForm, parseClientProfileForm, parseDeliveryForm, parseInviteForm, toFormResult } from './forms';

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const C1 = '00000000-0000-4000-8000-0000000000a1';

describe('parseInviteForm', () => {
  it('parses agency and client invitations', () => {
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'agency_admin' }))).toEqual({ email: 'a@b.co', role: 'agency_admin', clientId: null, clientScope: null });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'client_viewer', clientId: C1 }))).toMatchObject({ clientId: C1 });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'account_manager', scope: [C1] }))).toMatchObject({ clientScope: [C1] });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'account_manager' }))).toMatchObject({ clientScope: null });
  });
  it('rejects unknown roles', () => {
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'root' }))).toEqual({ error: 'Choose a role' });
  });
});

describe('parseBrandingForm', () => {
  it('keeps only known, non-empty fields', () => {
    expect(parseBrandingForm(fd({ displayName: 'Acme', primary: '#123456', signOff: '', evil: 'x' }))).toEqual({ displayName: 'Acme', primary: '#123456' });
  });
});

describe('parseDeliveryForm', () => {
  it('parses mode, auto-send checkbox and timezone', () => {
    expect(parseDeliveryForm(fd({ alertMode: 'direct', briefAutoSend: 'on', timezone: 'America/Denver' }))).toEqual({ alertMode: 'direct', briefAutoSend: true, timezone: 'America/Denver' });
    expect(parseDeliveryForm(fd({ alertMode: 'digest_only' }))).toEqual({ alertMode: 'digest_only', briefAutoSend: false });
    expect(parseDeliveryForm(fd({ alertMode: 'loud' }))).toEqual({ error: 'Choose an alert mode' });
  });
});

describe('parseClientProfileForm', () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it('parses a full profile', () => {
    const r = parseClientProfileForm(fd([
      ['name', ' Comfort Air '], ['verticalId', 'hvac_plumbing'], ['services', 'ac_tune_up'], ['services', 'furnace_tune_up'],
      ['keywords', 'ac repair\nhvac\n'], ['center', '33.9526, -84.3346'], ['radiusKm', '15'], ['zips', '30338, 30346 30350'],
      ['towns', 'Dunwoody\nSandy Springs'], ['placeId', ''], ['timezone', 'America/New_York'],
    ]));
    expect(r).toEqual({
      name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up', 'furnace_tune_up'], keywords: ['ac repair', 'hvac'], placeId: null, timezone: 'America/New_York',
      serviceArea: { center: { lat: 33.9526, lng: -84.3346 }, radiusKm: 15, zips: ['30338', '30346', '30350'], towns: ['Dunwoody', 'Sandy Springs'] },
    });
  });

  it('leaves the service area empty when no centre and no ZIPs are given', () => {
    const r = parseClientProfileForm(fd([['name', 'X'], ['verticalId', 'dental'], ['center', ''], ['radiusKm', ''], ['zips', '']]));
    expect(r).toMatchObject({ serviceArea: null, services: [], keywords: [] });
  });

  it('explains an unreadable centre or radius', () => {
    expect(parseClientProfileForm(fd([['name', 'X'], ['center', 'Dunwoody'], ['radiusKm', '10']]))).toEqual({ error: 'Enter the centre as "latitude, longitude" (e.g. 33.95, -84.33)' });
    expect(parseClientProfileForm(fd([['name', 'X'], ['center', '33.9, -84.3'], ['radiusKm', 'far']]))).toEqual({ error: 'Enter the radius in kilometres' });
  });
});

describe('toFormResult', () => {
  it('turns tool errors into messages and rethrows others', () => {
    expect(toFormResult(new ToolError('invalid_input', 'Bad'))).toEqual({ ok: false, error: 'Bad' });
    expect(toFormResult(new ToolError('not_found', 'x'))).toEqual({ ok: false, error: 'Not found' });
    expect(() => toFormResult(new Error('boom'))).toThrow('boom');
  });
});
