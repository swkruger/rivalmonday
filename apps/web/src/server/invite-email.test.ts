import { createMemoryTransport } from '@cs/email';
import { describe, expect, it } from 'vitest';
import { sendAgencyInviteEmailWith } from './invite-email';

const URL = 'https://app.test/join/rm_inv_secrettoken';

describe('sendAgencyInviteEmailWith', () => {
  it('sends one agency_invite email with the link, Rival Monday branding and the support reply-to', async () => {
    const t = createMemoryTransport();
    await sendAgencyInviteEmailWith({ transport: t, from: 'briefs@rivalmonday.test', replyTo: null }, { to: 'new@agency.test', url: URL, offer: 'trial', expiresAt: '2026-10-30T00:00:00.000Z', discountText: '20% off' });
    expect(t.sent).toHaveLength(1);
    const m = t.sent[0]!;
    expect(m).toMatchObject({ to: 'new@agency.test', from: 'briefs@rivalmonday.test', replyTo: 'support@rivalmonday.app', tag: 'agency_invite' });
    expect(m.text).toContain(URL);
    expect(m.html).toContain(URL);
    expect(JSON.stringify(m.metadata)).not.toContain('secrettoken');
  });

  it('uses SUPPORT_REPLY_TO when set', async () => {
    const t = createMemoryTransport();
    await sendAgencyInviteEmailWith({ transport: t, from: 'f@x.test', replyTo: 'help@x.test' }, { to: 'a@b.test', url: URL, offer: 'pilot', pilotEndsAt: '2026-12-01T23:59:59.000Z', expiresAt: '2026-10-30T00:00:00.000Z' });
    expect(t.sent[0]!.replyTo).toBe('help@x.test');
  });

  it('lets a transport failure propagate to the caller', async () => {
    const bad = { kind: 'memory' as const, send: async () => { throw new Error('boom'); } };
    await expect(sendAgencyInviteEmailWith({ transport: bad, from: 'f@x.test', replyTo: null }, { to: 'a@b.test', url: URL, offer: 'trial', expiresAt: '2026-10-30T00:00:00.000Z' })).rejects.toThrow('boom');
  });
});
