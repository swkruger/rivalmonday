import { waitlistEntry } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type EmailTransport } from '@cs/email';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWaitlistEmail } from './emails';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let transport: ReturnType<typeof createMemoryTransport>;
const deps = (t: EmailTransport = transport) => ({ service: dbs.service, transport: t, appUrl: 'https://app.test/', fromAddress: 'briefs@app.test', platformAdmins: [] });
async function mk(over: Partial<typeof waitlistEntry.$inferInsert> = {}) {
  const [w] = await dbs.service.insert(waitlistEntry).values({ kind: 'agency', contactName: 'Ada', email: 'ada@a.co', orgName: 'Agency Co', clientCountBand: '1-5', ipHash: 'h', ...over }).returning();
  return w!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  transport = createMemoryTransport();
});

describe('sendWaitlistEmail', () => {
  it('sends the platform-branded confirmation with the confirm link', async () => {
    const id = await mk({ sampleRequested: true, sampleStatus: 'requested', sampleBusinessName: 'Smith Dental' });
    await sendWaitlistEmail(deps(), id, 'confirmation', { confirmRaw: 'RAW1' });
    expect(transport.sent).toHaveLength(1);
    const m = transport.sent[0]!;
    expect(m).toMatchObject({ to: 'ada@a.co', replyTo: 'support@rivalmonday.app', tag: 'waitlist_confirmation', subject: 'Confirm your place in the Rival Monday pilot', metadata: { waitlist: id } });
    expect(m.from).toBe('"Rival Monday" <briefs@app.test>');
    expect(m.html).toContain('https://app.test/waitlist/confirm/RAW1');
    expect(m.text).toContain('Smith Dental');
  });

  it('throws on send failure without logging pii', async () => {
    const id = await mk();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: EmailTransport = { kind: 'memory', send: async () => { throw new Error('boom ada@a.co'); } };
    await expect(sendWaitlistEmail(deps(failing), id, 'confirmation', { confirmRaw: 'RAWSECRET' })).rejects.toThrow();
    const logged = err.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain(id);
    for (const s of ['ada@a.co', 'RAWSECRET', 'Agency Co']) expect(logged).not.toContain(s);
    err.mockRestore();
  });

  it('sample_ready is not implemented yet and confirmation needs confirmRaw', async () => {
    const id = await mk();
    await expect(sendWaitlistEmail(deps(), id, 'sample_ready', {})).rejects.toThrow('not implemented');
    await expect(sendWaitlistEmail(deps(), id, 'confirmation', {})).rejects.toThrow();
  });
});
