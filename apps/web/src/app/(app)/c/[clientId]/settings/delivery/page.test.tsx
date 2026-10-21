// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown, props: [] as unknown[], calls: [] as unknown[][] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
/** 7a2: recipients come from `list_client_recipients`; in a support session the registry returns them masked (`supportMask`). */
vi.mock('@/server/tools', () => ({
  callTool: async (ctx: { support?: unknown }, name: string, input: unknown) => {
    m.calls.push([name, input]);
    if (name === 'list_client_recipients') {
      return { items: [{ contactId: 'k1', email: ctx.support ? 'o•••@client.com' : 'owner@client.com', name: 'Owner', role: 'client_owner', active: true, hasAccount: true }] };
    }
    return { name: 'A1 HVAC', alertMode: 'direct', briefAutoSend: false, timezone: 'UTC' };
  },
}));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => [] }));
vi.mock('./delivery-controls', () => ({
  AddRecipientForm: (p: unknown) => { m.props.push(p); return null; },
  DeactivateRecipientButton: (p: unknown) => { m.props.push(p); return null; },
  DeliveryForm: (p: unknown) => { m.props.push(p); return null; },
}));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ClientDeliveryPage from './page';

afterEach(() => { cleanup(); m.props = []; m.calls = []; });
const open = () => ClientDeliveryPage({ params: Promise.resolve({ clientId: 'c1' }) });

describe('ClientDeliveryPage recipients (8b, 7a2)', () => {
  it('reads recipients through list_client_recipients and passes on only its (masked) emails in a support session — table and dialog props', async () => {
    m.viewer = { viewer: { kind: 'support' }, ctx: { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } } };
    const { container } = render(await open());
    expect(container.textContent).toContain('o•••@client.com');
    expect(container.textContent).not.toContain('owner@client.com');
    expect(JSON.stringify(m.props)).not.toContain('owner@client.com');
    expect(m.props).toContainEqual({ clientId: 'c1', contactId: 'k1', email: 'o•••@client.com' });
    expect(m.calls).toContainEqual(['list_client_recipients', { clientId: 'c1' }]);
  });

  it('shows real emails outside a session', async () => {
    m.viewer = { viewer: { kind: 'user' }, ctx: { role: 'agency_admin' } };
    const { container } = render(await open());
    expect(container.textContent).toContain('owner@client.com');
  });
});
