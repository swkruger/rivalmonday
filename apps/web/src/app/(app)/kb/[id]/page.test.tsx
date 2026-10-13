// @vitest-environment jsdom
import { ToolError } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));
vi.mock('next/navigation', () => ({ notFound: h.notFound }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: {} }) }));
// Mock only below the REAL `callTool`: the registry and the dependencies `toolDeps` resolves.
vi.mock('@cs/tools', () => ({ createToolRegistry: () => ({ invoke: h.invoke }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ webMonitoring: false, kbImport: false, appUrl: 'http://localhost' }) }));
vi.mock('@/server/queue', () => ({ enqueueFor: () => undefined, jobStatusFor: () => undefined }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/store', () => ({ webStore: () => ({ get: async () => null }) }));
import KbArticlePage from './page';

const ID = '44444444-4444-4444-8444-444444444444';
const params = () => ({ params: Promise.resolve({ id: ID }) });
beforeEach(() => { h.invoke.mockReset(); h.notFound.mockClear(); });
afterEach(cleanup);

describe('/kb/[id]', () => {
  it('404s when the tool refuses with not_found', async () => {
    h.invoke.mockRejectedValue(new ToolError('not_found', 'Article not found'));
    await expect(KbArticlePage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.notFound).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith(expect.anything(), 'get_kb_article', { kbId: ID });
  });

  it('renders the article title on success', async () => {
    h.invoke.mockResolvedValue({ kbId: ID, title: 'Reading your brief', kind: 'help', level: 'platform', bodyMd: 'Body text', sourceUrl: null, updatedAt: '2026-10-01T12:00:00.000Z' });
    render(await KbArticlePage(params()));
    expect(screen.getByRole('heading', { name: 'Reading your brief' })).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
    expect(h.notFound).not.toHaveBeenCalled();
  });
});
