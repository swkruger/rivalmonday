import { type AccessContext, createAccessContext } from '@cs/core';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { resolvePlaybooks } from '@cs/engine';
import { loadVerticalPack } from '@cs/verticals';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: role === 'agency_admin' ? 'all' : [agencyId === IDS.agencyA ? IDS.clientA1 : IDS.clientB1], features: [] });
const admin = ctx('agency_admin');
const am = ctx('account_manager');
const adminB = ctx('agency_admin', IDS.agencyB);
type View = { id: string; title: string; template: string; packTemplate: string; overridden: boolean; disabled: boolean };
const find = async (c: AccessContext, id: string) =>
  ((await registry.invoke(c, 'list_playbooks', {})) as { verticals: { id: string; playbooks: View[] }[] }).verticals.find((v) => v.id === 'hvac_plumbing')!.playbooks.find((p) => p.id === id)!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('playbooks (Review Focus 5)', () => {
  it('lists every pack playbook with the pack text when nothing is overridden', async () => {
    const p = await find(am, 'price_cut_bundle');
    expect(p).toMatchObject({ overridden: false, disabled: false });
    expect(p.template).toBe(p.packTemplate);
  });

  it('lets an admin override, disable and reset; other agencies never see it', async () => {
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: 'Bundle, don’t match', template: 'Bundle {{service}} against {{competitor}}.', disabled: false });
    expect(await find(admin, 'price_cut_bundle')).toMatchObject({ title: 'Bundle, don’t match', template: 'Bundle {{service}} against {{competitor}}.', overridden: true });
    expect((await find(adminB, 'price_cut_bundle')).overridden).toBe(false);
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, template: null, disabled: true });
    const pack = await loadVerticalPack('hvac_plumbing');
    expect((await resolvePlaybooks(dbs.service, IDS.agencyA, pack)).some((p) => p.id === 'price_cut_bundle')).toBe(false);
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, template: null, disabled: false });
    const reset = await find(admin, 'price_cut_bundle');
    expect(reset).toMatchObject({ overridden: false, disabled: false });
    expect(reset.template).toBe(reset.packTemplate);
  });

  it('stores nothing when the text equals the pack text', async () => {
    const p = await find(admin, 'price_cut_bundle');
    await registry.invoke(admin, 'update_playbook', { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: p.title, template: `  ${p.packTemplate}  `, disabled: false });
    expect((await find(admin, 'price_cut_bundle')).overridden).toBe(false);
  });

  it('refuses unknown placeholders, over-long text, unknown ids and non-admins', async () => {
    const base = { verticalId: 'hvac_plumbing', playbookId: 'price_cut_bundle', title: null, disabled: false };
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: 'Hi {{client}}' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/\{\{client\}\}/) });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: 'x'.repeat(2001) })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/2000/) });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, template: null, title: 't'.repeat(201) })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, playbookId: 'nope', template: null })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'update_playbook', { ...base, verticalId: 'bakeries', template: null })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'update_playbook', { ...base, template: 'Bundle {{service}}.' })).rejects.toMatchObject({ code: 'permission_denied' });
    expect((await find(admin, 'price_cut_bundle')).overridden).toBe(false);
  });
});
