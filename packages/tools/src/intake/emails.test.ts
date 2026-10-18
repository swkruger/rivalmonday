import { contact, intakeLink, lead, type SetupLookup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type EmailTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { sendLeadEmail } from './emails';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const lookup: SetupLookup = { placeId: 'p1', cid: null, title: 'Smith Dental', address: null, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2 };
const ready = { status: 'ready' as const, self: { name: 'Smith Dental', rating: 4.5, votes: 10 }, nearby: [], facts: ['3 of 5 nearby dentists have more reviews than you.'], summary: 'You trail on volume.', category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z' };

let transport: ReturnType<typeof createMemoryTransport>;
const deps = (t: EmailTransport = transport) => ({ service: dbs.service, transport: t, appUrl: 'https://app.test/', fromAddress: 'briefs@app.test', platformAdmins: ['Owner@Env.co'] });
async function mkLead(over: Partial<typeof lead.$inferInsert> = {}) {
  const [l] = await dbs.service.insert(lead).values({ agencyId: IDS.agencyA, source: 'agency_link', status: 'verified', contactName: 'Sam Smith', email: 'sam@smith.co', lookup, preview: ready, ...over }).returning();
  return l!.id;
}
const row = async (id: string) => (await dbs.service.select().from(lead).where(eq(lead.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  transport = createMemoryTransport();
  await dbs.service.insert(contact).values([
    { agencyId: IDS.agencyA, role: 'agency_admin', email: 'Admin@A.co', name: 'Ada' },
    { agencyId: IDS.agencyA, role: 'account_manager', email: 'amall@a.co' },
    { agencyId: IDS.agencyA, role: 'account_manager', email: 'amscoped@a.co', clientScope: [IDS.clientA1] },
  ]);
});

describe('sendLeadEmail', () => {
  it('verify: agency-branded link, reply-to via replyToFor (all-scope AM first), unguarded', async () => {
    const id = await mkLead({ status: 'unverified' });
    await sendLeadEmail(deps(), id, 'verify', { verifyRaw: 'RAW1' });
    await sendLeadEmail(deps(), id, 'verify', { verifyRaw: 'RAW2' });
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[0]).toMatchObject({ to: 'sam@smith.co', replyTo: 'amall@a.co', tag: 'lead_verify', subject: 'Confirm your email to see your competitor snapshot' });
    expect(transport.sent[0]!.html).toContain('https://app.test/start/verify/RAW1');
    expect(transport.sent[0]!.from).toMatch(/^"[^"]+" <briefs@app\.test>$/);
  });

  it('verify: the link names the intake page it came from (agency slug; "-" without one; nothing for the platform page)', async () => {
    const noLink = await mkLead({ status: 'unverified', email: 'nolink@x.co' });
    await sendLeadEmail(deps(), noLink, 'verify', { verifyRaw: 'RAW0' });
    expect(transport.sent[0]!.text).toContain('https://app.test/start/verify/RAW0?from=-');
    await dbs.service.insert(intakeLink).values({ agencyId: IDS.agencyA, slug: 'smith-co' });
    const a = await mkLead({ status: 'unverified' });
    await sendLeadEmail(deps(), a, 'verify', { verifyRaw: 'RAW1' });
    expect(transport.sent[1]!.text).toContain('https://app.test/start/verify/RAW1?from=smith-co');
    const p = await mkLead({ status: 'unverified', agencyId: null, source: 'platform', email: 'pool@x.co' });
    await sendLeadEmail(deps(), p, 'verify', { verifyRaw: 'RAW2' });
    expect(transport.sent[2]!.text).toMatch(/https:\/\/app\.test\/start\/verify\/RAW2(?!\?)/);
  });

  it('agency-branded mail never names Rival Monday; the unassigned pool confirmation carries the platform line', async () => {
    const a = await mkLead();
    await sendLeadEmail(deps(), a, 'confirmation');
    await sendLeadEmail(deps(), a, 'agency_new');
    expect(transport.sent.length).toBeGreaterThan(1);
    for (const m of transport.sent) for (const s of [m.subject, m.html, m.text, m.from]) expect(s).not.toMatch(/rival\s*monday/i);
    transport.sent.length = 0;
    const p = await mkLead({ agencyId: null, source: 'platform', email: 'pool@x.co' });
    await sendLeadEmail(deps(), p, 'confirmation');
    expect(transport.sent[0]!.text).toContain("We'll match you with a local marketing partner and they'll be in touch.");
    expect(transport.sent[0]!.replyTo).toBeNull();
    expect(transport.sent[0]!.from).toContain('Rival Monday');
  });

  it('confirmation carries the preview inline and no link', async () => {
    const id = await mkLead();
    await sendLeadEmail(deps(), id, 'confirmation');
    const m = transport.sent[0]!;
    expect(m.text).toContain('3 of 5 nearby dentists have more reviews than you.');
    expect(m.text).toContain('You trail on volume.');
    expect(m.html).not.toContain('href=');
  });

  it('guard prevents a second confirmation', async () => {
    const id = await mkLead();
    await sendLeadEmail(deps(), id, 'confirmation');
    await sendLeadEmail(deps(), id, 'confirmation');
    expect(transport.sent).toHaveLength(1);
    expect((await row(id)).confirmationSentAt).not.toBeNull();
  });

  it('send failure clears the guard so a retry sends', async () => {
    const id = await mkLead();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: EmailTransport = { kind: 'memory', send: async () => { throw new Error('boom'); } };
    await sendLeadEmail(deps(failing), id, 'confirmation');
    expect((await row(id)).confirmationSentAt).toBeNull();
    expect(spy.mock.calls.flat().join(' ')).not.toMatch(/sam@smith\.co|Smith Dental/);
    spy.mockRestore();
    await sendLeadEmail(deps(), id, 'confirmation');
    expect(transport.sent).toHaveLength(1);
  });

  it('agency_new goes to admins and all-scope account managers once, with the leads link', async () => {
    const id = await mkLead({ ref: 'flyer' });
    await sendLeadEmail(deps(), id, 'agency_new');
    await sendLeadEmail(deps(), id, 'agency_new');
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['admin@a.co', 'amall@a.co']);
    expect(transport.sent[0]!.subject).toBe('New lead: Smith Dental');
    expect(transport.sent[0]!.html).toContain('https://app.test/agency/leads');
    expect(transport.sent[0]!.text).toContain('Ref: flyer');
    expect((await row(id)).agencyNotifiedAt).not.toBeNull();
  });

  it('declined is agency-branded copy, once; pool leads are skipped', async () => {
    const id = await mkLead({ status: 'declined' });
    await sendLeadEmail(deps(), id, 'declined');
    await sendLeadEmail(deps(), id, 'declined');
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.text).toMatch(/isn't able to take on new clients in your area right now\./);
    const p = await mkLead({ agencyId: null, source: 'platform', email: 'pool@x.co' });
    await sendLeadEmail(deps(), p, 'declined');
    expect(transport.sent).toHaveLength(1);
  });

  it('pool_new goes to env list + owner/staff rows with platform branding and the /platform/leads link; assigned leads skipped', async () => {
    await seedUser(dbs.owner, 'u1', 'Staff@P.co');
    const { platformAdmin } = await import('@cs/db');
    await dbs.owner.insert(platformAdmin).values({ userId: 'u1', role: 'staff' });
    const id = await mkLead({ agencyId: null, source: 'platform', email: 'pool@x.co' });
    await sendLeadEmail(deps(), id, 'pool_new');
    await sendLeadEmail(deps(), id, 'pool_new');
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['owner@env.co', 'staff@p.co']);
    expect(transport.sent[0]!.html).toContain('https://app.test/platform/leads');
    expect(transport.sent[0]!.from).toContain('Rival Monday');
    const assigned = await mkLead({ email: 'b@b.co' });
    await sendLeadEmail(deps(), assigned, 'pool_new');
    expect(transport.sent).toHaveLength(2);
  });
});
