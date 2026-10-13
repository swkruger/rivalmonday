// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(app)/kb/actions', () => ({ loadKbArticle: vi.fn() }));
import { ArticleSheet } from './article-sheet';
import { KbArticleView } from './article-view';

const ID = '22222222-2222-4222-8222-222222222222';
const base = { kbId: ID, title: 'Reading your brief', kind: 'help' as const, level: 'platform' as const, bodyMd: 'Hello **world** <script>x</script>\n\n[more](https://example.com)', sourceUrl: null, updatedAt: '2026-10-01T12:00:00.000Z' };
afterEach(cleanup);

async function open(load: () => Promise<typeof base | null>) {
  render(<ArticleSheet kbId={ID} load={load} />);
  fireEvent.click(screen.getByRole('button', { name: /article/i }));
}

describe('ArticleSheet', () => {
  it('shows the missing copy on not_found', async () => {
    await open(async () => null);
    await waitFor(() => expect(screen.getByText('This article is no longer available.')).toBeTruthy());
  });

  it('loads and shows title, level, markdown (no raw html) and updated date', async () => {
    await open(async () => base);
    await waitFor(() => expect(screen.getAllByText('Reading your brief').length).toBeGreaterThan(0));
    expect(screen.getByText('Help')).toBeTruthy();
    expect(screen.getByText('world').tagName).toBe('STRONG');
    expect(document.querySelector('script')).toBeNull();
    const link = screen.getByRole('link', { name: 'more' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Updated Oct 1, 2026')).toBeTruthy();
  });
});

describe('KbArticleView', () => {
  it.each([['platform', 'Help'], ['agency', 'From your agency'], ['client', 'Your business']] as const)('level %s → %s', (level, label) => {
    render(<KbArticleView article={{ ...base, level }} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows the source link when the article has a source url', () => {
    render(<KbArticleView article={{ ...base, sourceUrl: 'https://example.com/a' }} />);
    const a = screen.getByRole('link', { name: /source/i });
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});
