// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown, items: [] as unknown[] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'America/Chicago' }));
vi.mock('@cs/tools', () => ({ listInbox: async () => m.items }));
vi.mock('./actions', () => ({ markAllReadAction: vi.fn(), openNotification: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/help/tip-row', () => ({ TipRow: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: () => null }));
const { default: InboxPage } = await import('./page');

const user = { viewer: { kind: 'user', userId: 'u1', name: 'U', email: 'u@x.io' }, ctx: { userId: 'u1' } };
const row = (o: Record<string, unknown>) => ({ id: 'n1', kind: 'alert', title: 'Price drop', body: 'Jones cut prices', link: null, clientId: 'c1', clientName: 'Acme HVAC', createdAt: new Date('2026-10-21T15:00:00Z'), readAt: null, ...o });

beforeEach(() => { m.viewer = user; });
afterEach(cleanup);

describe('inbox page', () => {
  it('inbox shows zone label and a New chip for unread', async () => {
    m.items = [row({}), row({ id: 'n2', title: 'Old news', readAt: new Date('2026-10-21T16:00:00Z') })];
    render(await InboxPage());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Inbox');
    expect(screen.getAllByText(/Oct 21, 10:00 AM CT/).length).toBe(2);
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Price drop \(new\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Old news,/ })).toBeTruthy();
  });

  it('inbox shows client name for agency rows', async () => {
    m.items = [row({})];
    const { container } = render(await InboxPage());
    expect(container.textContent).toContain('Acme HVAC');
  });

  it('a guest link shows no client line', async () => {
    m.viewer = { viewer: { kind: 'guest', contactId: 'c1' }, ctx: {} };
    m.items = [row({})];
    const { container } = render(await InboxPage());
    expect(container.textContent).not.toContain('Acme HVAC');
  });
});
