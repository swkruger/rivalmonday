// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ctx: { role: 'agency_admin', agencyId: 'a1', clientScope: 'all' as 'all' | string[] },
  guides: new Set<string>(),
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: m.ctx, viewer: { kind: 'user' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => m.guides }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Brightside Marketing', logoUrl: null } }) }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC & plumbing', services: [] }] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('./actions', () => ({ createClientAction: vi.fn(), findBusinessAction: vi.fn() }));
vi.mock('./vertical-actions', () => ({ createVerticalAction: vi.fn(), draftVerticalAction: vi.fn() }));
vi.mock('../../prospects/new/actions', () => ({ createProspectAction: vi.fn() }));
vi.mock('./new-client-flow', () => ({
  NewClientFlow: (p: Record<string, unknown>) => <div data-testid="flow" data-props={JSON.stringify({ ...p, find: undefined, create: undefined, verticalActions: undefined })} />,
}));

const { default: NewClient } = await import('./page');
const { default: NewProspect } = await import('../../prospects/new/page');
const props = () => JSON.parse(screen.getByTestId('flow').getAttribute('data-props')!) as Record<string, unknown>;

beforeEach(() => { m.ctx = { role: 'agency_admin', agencyId: 'a1', clientScope: 'all' }; m.guides = new Set(); });
afterEach(cleanup);

describe('Add a client / Add a prospect pages (steps 1-2 of the client flow)', () => {
  it('open the client flow in the agency brand, with the page guide only when one exists', async () => {
    render(await NewClient());
    expect(props()).toMatchObject({ kind: 'client', agency: { name: 'Brightside Marketing', logoUrl: null }, admin: true, guide: false, canUpgrade: true });
    cleanup();
    m.guides = new Set(['page:agency.clients.new']);
    render(await NewClient());
    expect(props().guide).toBe(true);
  });

  it('the prospect page is the same flow with its own guide key', async () => {
    m.guides = new Set(['page:agency.clients.new']);
    render(await NewProspect());
    expect(props()).toMatchObject({ kind: 'prospect', guide: false });
    cleanup();
    m.guides = new Set(['page:agency.prospects.new']);
    render(await NewProspect());
    expect(props().guide).toBe(true);
  });

  it('a non-admin who covers all clients walks the same flow (no billing step in the count)', async () => {
    m.ctx = { role: 'account_manager', agencyId: 'a1', clientScope: 'all' };
    render(await NewClient());
    expect(props()).toMatchObject({ admin: false, canUpgrade: false });
  });

  it('is a 404 for client roles and for an account manager scoped to some clients', async () => {
    for (const ctx of [{ role: 'client_owner', agencyId: 'a1', clientScope: ['c1'] }, { role: 'account_manager', agencyId: 'a1', clientScope: ['c1'] }]) {
      m.ctx = ctx;
      await expect(NewClient()).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(NewProspect()).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });
});
