// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const C = '00000000-0000-4000-8000-0000000000c1';
const m = vi.hoisted(() => ({ role: 'client_owner' as string, competitors: 'waiting_owner' as string, guides: new Set<string>() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: m.role }, viewer: { kind: 'user' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => m.guides }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Brightside Marketing', logoUrl: null } }) }));
vi.mock('@/server/tools', () => {
  const tool = async (_c: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: C, name: 'Cool Breeze', serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 16.1, zips: [] }, keywords: ['ac repair'] };
    if (name === 'get_client_setup') return { state: { competitors: m.competitors }, lookup: { city: 'Round Rock' }, competitorSuggestions: [], invite: { status: 'pending', name: null, email: null }, search: null };
    throw new Error(`unexpected ${name}`);
  };
  return { callTool: tool, tryCallTool: tool };
});
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('./owner-competitors', () => ({ OwnerCompetitors: (p: Record<string, unknown>) => <div data-testid="owner" data-props={JSON.stringify({ ...p, view: undefined })} /> }));

const { default: Page } = await import('./page');
const run = () => Page({ params: Promise.resolve({ clientId: C }) });

beforeEach(() => { m.role = 'client_owner'; m.competitors = 'waiting_owner'; m.guides = new Set(); });
afterEach(cleanup);

describe('Owner competitors page', () => {
  it('shows the picker to an owner who was asked', async () => {
    render(await run());
    const p = JSON.parse(screen.getByTestId('owner').getAttribute('data-props')!);
    expect(p).toMatchObject({ clientId: C, clientName: 'Cool Breeze', agency: { name: 'Brightside Marketing' }, place: 'Round Rock', radiusMiles: 10, guide: false });
  });
  it('competitors page 404 when not waiting_owner', async () => {
    for (const s of ['todo', 'ready', 'done', 'skipped']) {
      m.competitors = s;
      await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });
  it('sends staff to their wizard and 404s a client viewer', async () => {
    m.role = 'account_manager';
    await expect(run()).rejects.toThrow(`NEXT_REDIRECT:/c/${C}/setup`);
    m.role = 'client_viewer';
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('the guide flag follows the page help key', async () => {
    m.guides = new Set(['page:client.setup.competitors']);
    render(await run());
    expect(JSON.parse(screen.getByTestId('owner').getAttribute('data-props')!).guide).toBe(true);
  });
});
