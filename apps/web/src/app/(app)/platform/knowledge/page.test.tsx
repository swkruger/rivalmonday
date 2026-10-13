// @vitest-environment jsdom
import { ToolError } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  kbImport: false,
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));
vi.mock('next/navigation', () => ({ notFound: h.notFound, useRouter: () => ({ push: () => {} }) }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: {} }) }));
vi.mock('@cs/tools', () => ({ createToolRegistry: () => ({ invoke: h.invoke }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ webMonitoring: false, get kbImport() { return h.kbImport; }, appUrl: 'http://localhost' }) }));
vi.mock('@/server/queue', () => ({ enqueueFor: () => undefined, jobStatusFor: () => undefined }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/store', () => ({ webStore: () => ({ get: async () => null }) }));
vi.mock('@/server/run-tool', () => ({ runTool: vi.fn() }));
import KnowledgePage from './page';
import EditPage from './[id]/page';

const ID = '44444444-4444-4444-8444-444444444444';
const targets = { agencies: [{ id: 'a1', name: 'Ag One', clients: [{ id: 'c1', name: 'Lone Star' }] }] };
const row = (o: object) => ({
  id: ID, title: 'T', level: 'platform', kind: 'help', status: 'published', source: 'manual', agencyName: null, clientName: null, autoSync: false,
  lastSyncedAt: null, syncError: null, lastSyncChanged: false, updatedAt: new Date('2026-10-01T00:00:00Z'), ...o,
});
const answer = (items: object[]) => async (_c: unknown, name: string) => (name === 'list_kb_targets' ? targets : { items, nextCursor: null });
beforeEach(() => { h.invoke.mockReset(); h.notFound.mockClear(); h.kbImport = false; });
afterEach(cleanup);

describe('/platform/knowledge', () => {
  it('404s for a non-operator (list and edit pages)', async () => {
    h.invoke.mockRejectedValue(new ToolError('permission_denied', 'Platform operators only'));
    await expect(KnowledgePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(EditPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows the empty state', async () => {
    h.invoke.mockImplementation(answer([]));
    render(await KnowledgePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('No articles yet.')).toBeTruthy();
  });

  it('passes valid filters to the tool and ignores junk', async () => {
    h.invoke.mockImplementation(answer([]));
    await KnowledgePage({ searchParams: Promise.resolve({ level: 'client', status: 'bogus', q: ' alerts ' }) });
    expect(h.invoke).toHaveBeenCalledWith(expect.anything(), 'list_kb_articles', { level: 'client', q: 'alerts', limit: 25 });
  });

  it('renders source and sync badges', async () => {
    h.invoke.mockImplementation(answer([
      row({ id: 'm', title: 'Manual one' }),
      row({ id: 's', title: 'Seed one', source: 'seed' }),
      row({ id: 'u1', title: 'Changed', source: 'url', autoSync: true, lastSyncedAt: new Date('2026-10-05T10:00:00Z'), lastSyncChanged: true }),
      row({ id: 'u2', title: 'Same', source: 'url', autoSync: true, lastSyncedAt: new Date('2026-10-05T10:00:00Z') }),
      row({ id: 'u3', title: 'Broken', source: 'url', autoSync: true, syncError: 'Fetch failed' }),
      row({ id: 'u4', title: 'Off', source: 'url', autoSync: false }),
      row({ id: 'u5', title: 'Gave up', source: 'url', autoSync: false, syncError: 'Gave up after 3 tries' }),
    ]));
    render(await KnowledgePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Managed in repo')).toBeTruthy();
    expect(screen.getByText('Synced Oct 5, 2026 · changed')).toBeTruthy();
    expect(screen.getByText('Synced Oct 5, 2026')).toBeTruthy();
    expect(screen.getByText('Fetch failed').className).toContain('text-red');
    expect(screen.getAllByText('Auto-sync off')).toHaveLength(2);
    expect(screen.getByText('Gave up after 3 tries').className).toContain('text-red');
    expect(screen.getByRole('link', { name: 'Changed' }).getAttribute('href')).toBe('/platform/knowledge/u1');
  });

  it('hides the import panel when the flag is off and shows it when on', async () => {
    h.invoke.mockImplementation(answer([]));
    render(await KnowledgePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText('Import from a URL')).toBeNull();
    cleanup();
    h.kbImport = true;
    render(await KnowledgePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Import from a URL')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
  });
});
