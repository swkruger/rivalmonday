import type { AccessContext } from '@cs/core';
import { changeEvent, client, eventScore } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

const am = ctx('account_manager', 'all', ['alert_rules']);
const ownerRules = ctx('client_owner', [IDS.clientA1], ['dashboard', 'alert_rules']);
const ownerNoRules = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const viewerRules = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'alert_rules']);
const set = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'set_alert_rules', { clientId: IDS.clientA1, ...input });
const stored = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;

beforeEach(resetWorkspace);

describe('alert rules', () => {
  it('reads the pack defaults, saves custom thresholds and resets them', async () => {
    expect(await registry.invoke(ownerRules, 'get_alert_rules', { clientId: IDS.clientA1 })).toEqual({ alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } });
    expect(await set(ownerRules, { alert: 60, brief: 30 })).toEqual({ alert: 60, brief: 30, custom: true, defaults: { alert: 70, brief: 40 } });
    expect(await stored()).toEqual({ alert: 60, brief: 30 });
    expect(await set(am, { reset: true })).toMatchObject({ alert: 70, brief: 40, custom: false });
    expect(await stored()).toBeNull();
  });

  it('refuses bad thresholds with a message and changes nothing (Review Focus 4)', async () => {
    await set(ownerRules, { alert: 60, brief: 30 });
    for (const bad of [{ alert: 50, brief: 50 }, { alert: 40, brief: 60 }, { alert: 0, brief: 0 }, { alert: 101, brief: 40 }, { alert: 70, brief: 0 }, { alert: 70.5, brief: 40 }, { alert: Number.NaN, brief: 40 }, { alert: 70 }, {}]) {
      await expect(set(ownerRules, bad)).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(await stored()).toEqual({ alert: 60, brief: 30 });
  });

  it('needs the alert_rules flag, and manage to change (Review Focus 2)', async () => {
    await expect(registry.invoke(ownerNoRules, 'get_alert_rules', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(set(ownerNoRules, { alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await registry.invoke(viewerRules, 'get_alert_rules', { clientId: IDS.clientA1 })).toMatchObject({ alert: 70 });
    await expect(set(viewerRules, { alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ctx('agency_admin', 'all', [], IDS.agencyB), 'set_alert_rules', { clientId: IDS.clientA1, alert: 60, brief: 30 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not re-route events already scored', async () => {
    const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'promo', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    await dbs.owner.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 65, route: 'brief', factors: {} as never, packVersion: 1, scoredAt: new Date() });
    await set(ownerRules, { alert: 60, brief: 30 });
    expect((await dbs.owner.select({ r: eventScore.route }).from(eventScore))[0]!.r).toBe('brief');
  });
});
