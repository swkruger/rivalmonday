import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), redirected: null as string | null }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    m.redirected = p;
    throw new Error('NEXT_REDIRECT');
  },
}));
const { saveKbArticleAction, deleteKbArticleAction, setKbAutoSyncAction, startKbImportAction, kbImportStatusAction } = await import('./actions');

const ID = '44444444-4444-4444-8444-444444444444';
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const base = { title: ' How alerts work ', kind: 'help', level: 'platform', bodyMd: '# Hi' };
beforeEach(() => {
  m.runTool.mockReset();
  m.redirected = null;
});

describe('knowledge actions', () => {
  it('publish calls upsert_kb_article with status published', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { id: ID, lintWarnings: [] } });
    const r = await saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent: 'publish' }));
    expect(m.runTool).toHaveBeenCalledWith(expect.anything(), 'upsert_kb_article', expect.objectContaining({ id: ID, status: 'published', title: 'How alerts work', level: 'platform' }));
    expect(r).toEqual({ ok: true, message: 'Published.' });
  });

  it('save draft and unpublish both save a draft; lint warnings are returned', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { id: ID, lintWarnings: ['Mentions Friday.'] } });
    for (const intent of ['draft', 'unpublish']) {
      await saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent }));
      expect(m.runTool).toHaveBeenLastCalledWith(expect.anything(), 'upsert_kb_article', expect.objectContaining({ status: 'draft' }));
    }
    const r = await saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent: 'draft' }));
    expect(r).toEqual({ ok: true, message: 'Draft saved. Warnings: Mentions Friday.' });
  });

  it('scope ids only travel at the matching level; client_visible only applies at agency level', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { id: ID, lintWarnings: [] } });
    await saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent: 'draft', agencyId: 'a1', clientId: 'c1' }));
    const platform = m.runTool.mock.calls[0]![2] as Record<string, unknown>;
    expect(platform).not.toHaveProperty('agencyId');
    expect(platform).not.toHaveProperty('clientId');
    await saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent: 'draft', level: 'agency', agencyId: 'a1', clientId: 'c1' }));
    const agency = m.runTool.mock.calls[1]![2] as Record<string, unknown>;
    expect(agency).toMatchObject({ agencyId: 'a1', clientVisible: false });
    expect(agency).not.toHaveProperty('clientId');
  });

  it('a new article redirects to its edit page; a refusal (seed row) comes back as the form error', async () => {
    m.runTool.mockResolvedValueOnce({ ok: true, data: { id: ID, lintWarnings: [] } });
    await expect(saveKbArticleAction({ ok: true }, form({ ...base, intent: 'publish' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(m.redirected).toBe(`/platform/knowledge/${ID}`);
    m.runTool.mockResolvedValueOnce({ ok: false, error: 'Managed in repo' });
    await expect(saveKbArticleAction({ ok: true }, form({ ...base, id: ID, intent: 'draft' }))).resolves.toEqual({ ok: false, error: 'Managed in repo' });
  });

  it('delete, auto-sync and import go through runTool', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true } });
    await expect(deleteKbArticleAction({ ok: true }, form({ id: ID }))).rejects.toThrow('NEXT_REDIRECT');
    expect(m.runTool).toHaveBeenLastCalledWith(expect.anything(), 'delete_kb_article', { id: ID });
    expect(m.redirected).toBe('/platform/knowledge');
    await setKbAutoSyncAction({ ok: true }, form({ id: ID, autoSync: 'true' }));
    expect(m.runTool).toHaveBeenLastCalledWith(expect.anything(), 'set_kb_auto_sync', { id: ID, autoSync: true });
    m.runTool.mockResolvedValueOnce({ ok: true, data: { key: 'k1' } });
    await expect(startKbImportAction(form({ url: 'https://x.example/a', level: 'platform', kind: 'blog', autoSync: 'on' }))).resolves.toEqual({ ok: true, key: 'k1' });
    expect(m.runTool).toHaveBeenLastCalledWith(expect.anything(), 'import_kb_url', { url: 'https://x.example/a', level: 'platform', kind: 'blog', autoSync: true });
    m.runTool.mockResolvedValueOnce({ ok: true, data: { state: 'running' } });
    await expect(kbImportStatusAction('k1')).resolves.toEqual({ ok: true, status: { state: 'running' } });
  });
});
