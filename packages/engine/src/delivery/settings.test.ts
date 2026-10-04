import { createAccessContext } from '@cs/core';
import { agencyWebhook, client, feedback } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addAgencyWebhook, updateClientDelivery, webhookUrlProblem } from './settings';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'owner-1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['alert_rules'] });
const otherAm = createAccessContext({ agencyId: IDS.agencyB, userId: 'am-b', role: 'account_manager', clientScope: 'all', features: [] });
const deps = () => ({ service: dbs.service, app: dbs.app });

describe('webhook URL policy (SSRF guard)', () => {
  it('accepts Slack and Teams Workflows webhook hosts over https', () => {
    expect(webhookUrlProblem('slack', 'https://hooks.slack.com/services/T000/B000/XXXX')).toBeNull();
    expect(webhookUrlProblem('teams', 'https://contoso.webhook.office.com/webhookb2/abc/IncomingWebhook/def')).toBeNull();
    expect(webhookUrlProblem('teams', 'https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x')).toBeNull();
    expect(webhookUrlProblem('teams', 'https://default123.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x')).toBeNull();
  });

  it('refuses anything else', () => {
    for (const bad of [
      'http://hooks.slack.com/services/x', 'https://hooks.slack.com.evil.example/x', 'https://user:pw@hooks.slack.com/x',
      'https://hooks.slack.com:8443/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'not a url',
    ]) expect(webhookUrlProblem('slack', bad)).not.toBeNull();
    expect(webhookUrlProblem('teams', 'https://hooks.slack.com/services/x')).not.toBeNull();
    expect(webhookUrlProblem('teams', 'https://evil.example/.webhook.office.com')).not.toBeNull();
  });

  it('stores a valid webhook and refuses an invalid one or an unknown kind filter', async () => {
    const id = await addAgencyWebhook(dbs.service, { agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T/B/X', kinds: ['am_alert'], createdBy: 'am-1' });
    expect((await dbs.owner.select().from(agencyWebhook).where(eq(agencyWebhook.id, id)))[0]).toMatchObject({ kind: 'slack', kinds: ['am_alert'], active: true });
    await expect(addAgencyWebhook(dbs.service, { agencyId: IDS.agencyA, kind: 'slack', url: 'https://example.com/hook', createdBy: 'am-1' })).rejects.toThrow(/webhook/i);
    await expect(addAgencyWebhook(dbs.service, { agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T/B/X', kinds: ['alert'], createdBy: 'am-1' })).rejects.toThrow(/agency notification kinds/);
  });
});

describe('client delivery settings', () => {
  it('lets an AM set the alert mode and auto-send, recording feedback', async () => {
    await updateClientDelivery(deps(), am, IDS.clientA1, { alertMode: 'direct', briefAutoSend: true });
    const [c] = await dbs.owner.select({ mode: client.alertMode, auto: client.briefAutoSend }).from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toEqual({ mode: 'direct', auto: true });
    const [f] = await dbs.owner.select().from(feedback);
    expect(f).toMatchObject({ subjectType: 'client', subjectId: IDS.clientA1, kind: 'edit', actor: 'am-1', before: { alertMode: 'after_am_check', briefAutoSend: false }, after: { alertMode: 'direct', briefAutoSend: true } });
  });

  it('refuses client roles, other agencies and unknown modes', async () => {
    await expect(updateClientDelivery(deps(), owner, IDS.clientA1, { alertMode: 'direct' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(updateClientDelivery(deps(), otherAm, IDS.clientA1, { alertMode: 'direct' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(updateClientDelivery(deps(), am, IDS.clientA1, { alertMode: 'loud' as never })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
