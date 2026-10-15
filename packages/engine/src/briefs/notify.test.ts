import { agencyWebhook, brief, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { notifyBriefOutcome } from './notify';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
  await dbs.service.insert(agencyWebhook).values({ agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T/B/X', createdBy: 'x' });
});
async function seedBrief(status: 'ready' | 'failed', attempts = 1) {
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: day(-7), periodEnd: day(0), status, attempts, summary: 'Two moves.', error: status === 'failed' ? 'jev and llm down' : null, dropped: { items: 1, sentences: 2 } }).returning();
  return b!;
}

describe('notifyBriefOutcome', () => {
  it('tells agency staff (and webhooks), never the client, that a brief is ready', async () => {
    const b = await seedBrief('ready');
    const n = await notifyBriefOutcome({ db: dbs.service, delivery }, { status: 'ready', briefId: b.id, kind: 'standard', items: 2, dropped: { items: 1, sentences: 2 } }, day(0));
    expect(n).toBe(3);
    const rows = await dbs.owner.select().from(notification);
    expect(rows.every((r) => r.kind === 'brief_ready')).toBe(true);
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app', 'slack']);
    expect(rows.find((r) => r.channel === 'in_app')!.body).toContain('2 items');
    expect(rows.some((r) => r.address === 'owner@a1.example')).toBe(false);
  });

  it('reports a failure only once the last attempt has failed', async () => {
    const first = await seedBrief('failed', 1);
    expect(await notifyBriefOutcome({ db: dbs.service, delivery }, { status: 'failed', briefId: first.id, error: 'x' }, day(0))).toBe(0);
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    const last = await seedBrief('failed', 3);
    expect(await notifyBriefOutcome({ db: dbs.service, delivery }, { status: 'failed', briefId: last.id, error: 'jev and llm down' }, day(0))).toBe(2);
    const [row] = await dbs.owner.select().from(notification);
    expect(row).toMatchObject({ kind: 'brief_failed' });
    expect(row!.body).toContain('jev and llm down');
  });

  it('a failed starting point gets the starting-point retry copy, not weekly-brief advice', async () => {
    const b = await seedBrief('failed', 3);
    await dbs.service.update(brief).set({ kind: 'starting_point', error: 'scorecard boom' });
    await notifyBriefOutcome({ db: dbs.service, delivery }, { status: 'failed', briefId: b.id, error: 'x' }, day(0));
    const inApp = (await dbs.owner.select().from(notification)).find((r) => r.channel === 'in_app')!;
    expect(inApp.body).toBe(`Your starting point brief for A1 HVAC could not be generated. Run \`pnpm --filter @cs/worker brief-once --client ${IDS.clientA1} --starting-point\` to try again.\nLast error: scorecard boom`);
    expect(inApp.body).not.toMatch(/--force|skip this week/);
  });

  it('uses the decided notice for a ready starting point', async () => {
    const b = await seedBrief('ready');
    await dbs.service.update(brief).set({ kind: 'starting_point', dropped: { items: 0, sentences: 0 } });
    await notifyBriefOutcome({ db: dbs.service, delivery }, { status: 'ready', briefId: b.id, kind: 'starting_point', items: 3, dropped: { items: 0, sentences: 0 } }, day(0));
    const rows = await dbs.owner.select().from(notification);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.title === 'Your starting point brief for A1 HVAC is ready to review.')).toBe(true);
    expect(rows.find((r) => r.channel === 'in_app')!.body).toContain('as soon as you approve it');
  });
});
