import { describe, expect, it, vi } from 'vitest';

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: {} }) }));
vi.mock('@/server/tools', () => ({
  callTool: async () => { notFound(); },
}));
import KbArticlePage from './page';

describe('/kb/[id]', () => {
  it('404s when the tool refuses', async () => {
    await expect(KbArticlePage({ params: Promise.resolve({ id: '44444444-4444-4444-8444-444444444444' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
