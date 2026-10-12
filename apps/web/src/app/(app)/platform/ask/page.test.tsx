// @vitest-environment jsdom
import { ToolError } from '@cs/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const get = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { userId: 'u' } }) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({}), isHiddenToolError: (e: unknown) => e instanceof ToolError && ['not_found', 'permission_denied', 'invalid_input'].includes(e.code) }));
vi.mock('@cs/tools', () => ({ listReviewableAskThreads: (...a: unknown[]) => list(...a), getReviewableAskThread: (...a: unknown[]) => get(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ThreadPage from './[threadId]/page';
import ListPage from './page';

describe('platform Ask review pages', () => {
  beforeEach(() => { list.mockReset(); get.mockReset(); });

  it('404 for a non-operator on both pages', async () => {
    list.mockRejectedValue(new ToolError('permission_denied', 'Platform operators only'));
    get.mockRejectedValue(new ToolError('permission_denied', 'Platform operators only'));
    await expect(ListPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(ThreadPage({ params: Promise.resolve({ threadId: 't' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('lists flagged threads and shows a thread as plain text', async () => {
    list.mockResolvedValue({ items: [{ id: 't1', agencyName: 'Ag', clientName: 'Lone Star', createdAt: new Date('2026-10-01T10:00:00Z'), flags: { removed: 2, error: false, refused: true, quota: false } }], nextCursor: null });
    render(await ListPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('2 removed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lone Star' }).getAttribute('href')).toBe('/platform/ask/t1');
    get.mockResolvedValue({ id: 't1', title: 'Q', agencyName: 'Ag', clientName: 'Lone Star', createdAt: new Date(), messages: [{ id: 'm', role: 'assistant', content: '<b>hi</b>', citations: ['ev:1'], status: 'ok', action: null, trace: { model: 'x' }, createdAt: new Date() }] });
    const { container } = render(await ThreadPage({ params: Promise.resolve({ threadId: 't1' }) }));
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>hi</b>')).toBeTruthy();
  });
});
