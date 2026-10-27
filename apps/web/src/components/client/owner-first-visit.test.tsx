// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const C = '00000000-0000-4000-8000-0000000000c1';
const m = vi.hoisted(() => ({ dismissed: false }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (m.dismissed && n === `rm_welcome_${C}` ? { value: '1' } : undefined) }) }));
const theme = vi.hoisted(() => vi.fn(async () => ({ branding: { displayName: 'Brightside Marketing' } })));
vi.mock('@/server/theme', () => ({ themeForViewer: theme }));
vi.mock('./owner-welcome-actions', () => ({ dismissWelcome: vi.fn() }));

const { OwnerFirstVisit } = await import('./owner-first-visit');
const ownerCtx = { role: 'client_owner' } as never;
const viewer = { kind: 'user', name: 'Maria Alvarez' } as never;
const setup = (competitors: string) => ({ state: { competitors }, lookup: { city: 'Round Rock' }, competitorSuggestions: [{ status: 'suggested' }, { status: 'suggested' }, { status: 'accepted' }] }) as never;
const show = async (o: { ctx?: unknown; viewer?: unknown; setup?: unknown; startingPending?: boolean } = {}) =>
  render(
    await OwnerFirstVisit({
      clientId: C,
      ctx: (o.ctx ?? ownerCtx) as never,
      viewer: (o.viewer ?? viewer) as never,
      setup: (o.setup ?? setup('todo')) as never,
      startingPending: o.startingPending ?? true,
    }),
  );

beforeEach(() => { m.dismissed = false; theme.mockClear(); });
afterEach(cleanup);

describe('OwnerFirstVisit', () => {
  it('welcomes an owner by first name in the agency name', async () => {
    await show();
    expect(screen.getByText('Welcome, Maria. Brightside Marketing set this up for you. Your starting point is on its way.')).toBeTruthy();
    expect(screen.queryByText(/asked you to choose/)).toBeNull();
  });
  it('shows nothing once the welcome cookie is set', async () => {
    m.dismissed = true;
    await show();
    expect(screen.queryByText(/Welcome/)).toBeNull();
  });
  it('hides the welcome once the starting point is no longer pending', async () => {
    await show({ startingPending: false });
    expect(screen.queryByText(/Welcome/)).toBeNull();
  });
  it('reads the cookie first: no theme lookup when nothing shows', async () => {
    m.dismissed = true;
    await show();
    expect(theme).not.toHaveBeenCalled();
  });
  it('shows the choose-competitors card while the agency waits on the owner, even after the welcome is dismissed', async () => {
    m.dismissed = true;
    await show({ setup: setup('waiting_owner') });
    expect(screen.getByText('Brightside Marketing asked you to choose who to watch')).toBeTruthy();
    expect(screen.getByText(/We found 2 businesses near Round Rock\./)).toBeTruthy();
  });
  it('shows nothing to agency staff or client viewers', async () => {
    await show({ ctx: { role: 'agency_admin' }, setup: setup('waiting_owner') });
    expect(screen.queryByText(/Welcome|asked you/)).toBeNull();
    cleanup();
    await show({ ctx: { role: 'client_viewer' }, setup: setup('waiting_owner') });
    expect(screen.queryByText(/Welcome|asked you/)).toBeNull();
  });
});
