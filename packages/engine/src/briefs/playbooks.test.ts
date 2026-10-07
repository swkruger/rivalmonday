import { createAccessContext } from '@cs/core';
import { playbookOverride } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventCandidate } from './gather';
import { playbookVars, renderPlaybook, resolvePlaybooks, playbookFor, unknownPlaybookVars, upsertPlaybookOverride } from './playbooks';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'own-1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['manage_competitors'] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('playbooks', () => {
  it('renders placeholders and fills missing values with neutral words', () => {
    expect(renderPlaybook('{{competitor}} cut {{service}} to {{new_price}} in {{areas}}.', { competitor: 'Smith HVAC', service: 'AC tune-up' }))
      .toBe('Smith HVAC cut AC tune-up to a lower price in new areas.');
  });

  it('fills {{theme}} from the theme name, falling back to the theme id', () => {
    const ev = (details: Record<string, string>) => ({ kind: 'event', competitorName: 'Smith HVAC', facts: [], zips: [], serviceName: null, details }) as unknown as EventCandidate;
    expect(playbookVars(ev({ themeName: 'Late arrivals', theme: 'late_arrival' })).theme).toBe('Late arrivals');
    expect(playbookVars(ev({ theme: 'late_arrival' })).theme).toBe('late_arrival');
  });

  it('applies agency overrides and disables', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    await upsertPlaybookOverride({ service: dbs.service, app: dbs.app }, am, { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', template: 'Bundle {{service}}.' }, pack);
    await upsertPlaybookOverride({ service: dbs.service, app: dbs.app }, am, { verticalId: 'hvac_plumbing', playbookId: 'ad_surge_watch', disabled: true }, pack);
    const list = await resolvePlaybooks(dbs.service, IDS.agencyA, pack);
    expect(playbookFor(list, 'price_change')).toMatchObject({ template: 'Bundle {{service}}.', source: 'agency', title: 'Answer a price cut with a value bundle' });
    expect(playbookFor(list, 'ad_surge')).toBeUndefined();
    expect(playbookFor(await resolvePlaybooks(dbs.service, IDS.agencyB, pack), 'ad_surge')).toBeDefined();
  });

  it('lists unknown placeholders, whatever their spelling', () => {
    expect(unknownPlaybookVars('Beat {{competitor}} on {{ service }}.')).toEqual([]);
    expect(unknownPlaybookVars('Hi {{client}} and {{ Competitor }} and {{client}}')).toEqual(['client', 'Competitor']);
    expect(unknownPlaybookVars('Plain text')).toEqual([]);
  });

  it('refuses client roles, unknown playbooks and oversized templates', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    const deps = { service: dbs.service, app: dbs.app };
    await expect(upsertPlaybookOverride(deps, owner, { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', template: 'x' }, pack)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(upsertPlaybookOverride(deps, am, { verticalId: 'hvac_plumbing', playbookId: 'nope', template: 'x' }, pack)).rejects.toThrow(/unknown playbook/i);
    await expect(upsertPlaybookOverride(deps, am, { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', template: 'x'.repeat(2001) }, pack)).rejects.toThrow(/2000/);
    expect(await dbs.owner.select().from(playbookOverride)).toHaveLength(0);
  });
});
