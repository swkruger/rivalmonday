import { describe, expect, it } from 'vitest';
import { clientCrumbs, clientSettingsCrumbs } from './client-crumbs';

const client = { id: 'c1', name: 'Cool Air' };

describe('clientCrumbs (15a §2.7: root = client name, then the group as text, then the page)', () => {
  it('links the client root to the Overview and keeps strings as plain text', () => {
    expect(clientCrumbs(client, 'Insights', 'Pricing')).toEqual([{ label: 'Cool Air', href: '/c/c1' }, { label: 'Insights' }, { label: 'Pricing' }]);
  });

  it('passes linked crumbs through', () => {
    expect(clientCrumbs(client, { label: 'Changes', href: '/c/c1/changes' }, 'Evidence')).toEqual([
      { label: 'Cool Air', href: '/c/c1' }, { label: 'Changes', href: '/c/c1/changes' }, { label: 'Evidence' },
    ]);
  });

  it('settings pages: client › Client settings (linked) › tab', () => {
    expect(clientSettingsCrumbs(client, 'Alert rules')).toEqual([
      { label: 'Cool Air', href: '/c/c1' }, { label: 'Client settings', href: '/c/c1/settings' }, { label: 'Alert rules' },
    ]);
  });
});
