import { describe, expect, it } from 'vitest';
import { navFor, type NavRoleFlags, settingsNavFor } from '@/components/shell/nav-items';
import { groupGuides, type HelpGuide } from './help-groups';

const C = '00000000-0000-4000-8000-0000000000c1';
const flags: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true, ask: true };
const g = (id: string): HelpGuide => ({ helpKey: `page:${id}`, title: `Guide ${id}`, articleId: `art-${id}` });

describe('groupGuides', () => {
  it('puts each guide under the menu section holding its page, in menu order', () => {
    const groups = groupGuides('client', navFor('client', flags, C), settingsNavFor('client', flags, C), [g('client.reviews'), g('client.overview'), g('client.changes'), g('client.settings.profile')]);
    expect(groups.map((x) => [x.heading, x.guides.map((y) => y.helpKey)])).toEqual([
      ['General', ['page:client.overview']],
      ['Insights', ['page:client.changes', 'page:client.reviews']],
      ['Settings', ['page:client.settings.profile']],
    ]);
  });

  it('puts guides with no menu item under "Other" and drops empty groups', () => {
    const groups = groupGuides('agency', navFor('agency', flags, null), settingsNavFor('agency', flags), [g('agency.approvals'), g('agency.settings.team'), g('agency.nowhere'), g('platform.costs')]);
    expect(groups.map((x) => [x.heading, x.guides.map((y) => y.helpKey)])).toEqual([
      ['Work', ['page:agency.approvals']],
      ['Settings', ['page:agency.settings.team']],
      ['Other', ['page:agency.nowhere', 'page:platform.costs']],
    ]);
  });

  it('is empty without guides', () => {
    expect(groupGuides('platform', navFor('platform', { ...flags, isPlatformOperator: true }, null), [], [])).toEqual([]);
  });
});
