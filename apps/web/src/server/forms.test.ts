import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { parseBrandingForm, parseDeliveryForm, parseInviteForm, toFormResult } from './forms';

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

describe('toFormResult', () => {
  it('turns tool errors into messages and rethrows others', () => {
    expect(toFormResult(new ToolError('invalid_input', 'Bad'))).toEqual({ ok: false, error: 'Bad' });
    expect(toFormResult(new ToolError('not_found', 'x'))).toEqual({ ok: false, error: 'Not found' });
    expect(() => toFormResult(new Error('boom'))).toThrow('boom');
  });
});
