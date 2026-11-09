import { brief, briefItem, notification } from '@cs/db';
import { createMemoryTransport } from '@cs/email';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import { createEmailSender, type DeliveryConfig, type NotificationRow } from '../delivery/outbox';
import { attachmentName, briefAttachment, MAX_ATTACHMENT_BYTES, RENDER_FAILURE_BACKOFF_MS } from './attachment';
import { deliverBrief } from './deliver';
import { briefPdfKey, type PdfDeps } from './pdf';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const NOW = new Date('2026-11-02T13:05:00Z');
const PDF = new Uint8Array([37, 80, 68, 70, 45]);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example', name: 'Pat Lee' });
});

async function seedBrief(o: Partial<typeof brief.$inferInsert> = {}) {
  const ev = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(25) });
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-11-02', periodStart: day(22), periodEnd: day(29), status: 'approved', kind: 'standard', summary: 'S.', ...o }).returning();
  await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'H0', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'M', eventIds: [ev.eventId], evidenceIds: [], upsellTag: 'ppc', status: 'active' });
  return b!.id;
}
const emailRow = async (briefId: string) => (await dbs.owner.select().from(notification).where(eq(notification.subjectId, briefId))).find((n) => n.channel === 'email')! as NotificationRow;
const deps = (pdf: PdfDeps['pdf']): PdfDeps => ({ db: dbs.service, store: createMemoryStore(), pdf });
const makeSender = (d: PdfDeps) => {
  const transport = createMemoryTransport();
  return { transport, sender: createEmailSender({ transport, fromAddress: 'b@agency.example', attachment: briefAttachment(d) }) };
};

describe('PDF attachment at dispatch', () => {
  it('deliverBrief clears pdf_key; the sender renders a fresh PDF', async () => {
    const id = await seedBrief({ pdfKey: 'briefs/old.v1.pdf' });
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    expect((await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!.pdfKey).toBeNull();
    const pdf = vi.fn(async () => PDF);
    const { transport, sender } = makeSender(deps(pdf));
    const row = await emailRow(id);
    expect((row.payload as { props: { attachPdf?: boolean } }).props.attachPdf).toBe(true);
    await sender.send(row, NOW);
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(transport.sent[0]!.attachments).toEqual([{ name: 'A1 HVAC weekly report 2026-11-02.pdf', contentType: 'application/pdf', content: PDF }]);
    expect(transport.sent[0]!.text).toContain('Your full report is attached (PDF).');
    expect((await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!.pdfKey).toBe(briefPdfKey(IDS.agencyA, id));
    // A second recipient reuses the stored PDF: no second render.
    await sender.send(row, NOW);
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(transport.sent[1]!.attachments).toHaveLength(1);
  });

  it('attached flag reaches the rendered email: set with the attachment, cleared (link kept) without it', async () => {
    const id = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const row = await emailRow(id);
    const ok = makeSender(deps(async () => PDF));
    await ok.sender.send(row, NOW);
    expect(ok.transport.sent[0]!.text).toContain('Your full report is attached (PDF).');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = makeSender(deps(async () => { throw new Error('boom'); }));
    await bad.sender.send(row, NOW);
    warn.mockRestore();
    expect(bad.transport.sent[0]!.attachments).toBeUndefined();
    expect(bad.transport.sent[0]!.html).toContain('/l/');
    expect(bad.transport.sent[0]!.text).not.toContain('Your full report is attached');
  });

  it('sends without attachment when the render throws', async () => {
    const id = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { transport, sender } = makeSender(deps(async () => { throw new Error('chromium down'); }));
    await expect(sender.send(await emailRow(id), NOW)).resolves.toMatchObject({ providerId: expect.any(String) });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.attachments).toBeUndefined();
    expect(transport.sent[0]!.text).not.toContain('Your full report is attached');
    expect(transport.sent[0]!.html).toContain('Download as PDF'); // the link stays as the fallback
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pdf attach failed'));
    warn.mockRestore();
  });

  it('a failing renderer is tried once per backoff window: both recipients are sent without the attachment', async () => {
    const id = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = 1_000_000;
    const pdf = vi.fn(async (): Promise<Uint8Array> => { throw new Error('chromium down'); });
    const transport = createMemoryTransport();
    const sender = createEmailSender({ transport, fromAddress: 'b@agency.example', attachment: briefAttachment(deps(pdf), { now: () => clock }) });
    const row = await emailRow(id);
    await sender.send(row, NOW);
    await sender.send({ ...row, address: 'second@a1.example' }, NOW);
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent.map((m) => m.attachments)).toEqual([undefined, undefined]);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('pdf attach failed'))).toHaveLength(1); // logged once
    // After the backoff window a render is tried again.
    clock += RENDER_FAILURE_BACKOFF_MS;
    await sender.send(row, NOW);
    expect(pdf).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('logs "no current pdf" when the render is skipped (no key)', async () => {
    const id = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The brief left 'sent' between the resolver's check and the render: ensureBriefPdf returns null.
    const pdf = vi.fn(async () => { await dbs.owner.update(brief).set({ status: 'approved' }).where(eq(brief.id, id)); return PDF; });
    expect(await briefAttachment(deps(pdf))(await emailRow(id))).toBeNull();
    expect(warn).toHaveBeenCalledWith(`[briefs] pdf attach failed: ${id}: no current pdf`);
    warn.mockRestore();
  });

  it('sends without attachment when the PDF exceeds 9 MB', async () => {
    const id = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { transport, sender } = makeSender(deps(async () => new Uint8Array(MAX_ATTACHMENT_BYTES + 1)));
    await sender.send(await emailRow(id), NOW);
    expect(transport.sent[0]!.attachments).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('too large'));
    warn.mockRestore();
  });

  it("never attaches for a starting point, an alert, or another agency's brief", async () => {
    const pdf = vi.fn(async () => PDF);
    const att = briefAttachment(deps(pdf));
    const sp = await seedBrief({ kind: 'starting_point', status: 'sent', sentAt: NOW, deliveryDate: '2026-10-26' });
    const wk = await seedBrief({ status: 'sent', sentAt: NOW });
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'brief', subjectType: 'brief' } as NotificationRow;
    expect(await att({ ...base, subjectId: sp })).toBeNull();
    expect(await att({ ...base, kind: 'alert', subjectType: 'alert', subjectId: wk })).toBeNull();
    expect(await att({ ...base, agencyId: IDS.agencyB, subjectId: wk })).toBeNull();
    expect(await att({ ...base, clientId: null as never, subjectId: wk })).toBeNull();
    expect(await att({ ...base, subjectId: '00000000-0000-4000-8000-0000000000ff' })).toBeNull();
    expect(pdf).not.toHaveBeenCalled();
    expect(await att({ ...base, subjectId: wk })).not.toBeNull(); // control: the right row does attach
  });

  it('email props: attachPdf for a weekly brief, never for a starting point', async () => {
    const sp = await seedBrief({ kind: 'starting_point', deliveryDate: '2026-10-26' });
    const wk = await seedBrief();
    await deliverBrief({ db: dbs.service, delivery }, sp, NOW);
    await deliverBrief({ db: dbs.service, delivery }, wk, NOW);
    const flag = async (id: string) => ((await emailRow(id)).payload as { props: { attachPdf?: boolean } }).props.attachPdf;
    expect(await flag(wk)).toBe(true);
    expect(await flag(sp)).toBe(false);
  });

  it('attachmentName strips path and control characters', () => {
    const n = attachmentName('../../etc/pa\\ss\u0000wd:*?"<>|\n x', '2026-11-02');
    expect(n).toBe('.. .. etc pa ss wd x weekly report 2026-11-02.pdf');
    expect(n).not.toMatch(/[/\\:*?"<>|\u0000-\u001f]/);
    expect(attachmentName('\u0001\u0002', '2026-11-02')).toBe('Client weekly report 2026-11-02.pdf');
    expect(attachmentName('x'.repeat(200), '2026-11-02')).toBe(`${'x'.repeat(80)} weekly report 2026-11-02.pdf`);
  });

  it('a zero-change weekly brief with the attachment says it is attached', async () => {
    const id = await seedBrief({ kind: 'quiet' });
    await dbs.owner.delete(briefItem).where(eq(briefItem.briefId, id));
    await deliverBrief({ db: dbs.service, delivery }, id, NOW);
    const { transport, sender } = makeSender(deps(async () => PDF));
    await sender.send(await emailRow(id), NOW);
    expect(transport.sent[0]!.text).toContain('Your full report is attached (PDF).');
  });
});
