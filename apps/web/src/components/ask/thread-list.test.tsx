// @vitest-environment jsdom
import type { AskThreadSummary } from '@cs/tools';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const { ThreadList } = await import('./thread-list');

afterEach(cleanup);
const C = '11111111-1111-4111-8111-111111111111';
const threads = [
  { id: 't1', title: 'Prices' },
  { id: 't2', title: 'Ads' },
] as unknown as AskThreadSummary[];
const bin = (title: string) => screen.getByRole('button', { name: `Delete conversation “${title}”` });

describe('ThreadList delete', () => {
  it('delete needs a confirm', async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: true });
    render(<ThreadList clientId={C} threads={threads} activeId="t1" deleteAction={deleteAction} />);
    fireEvent.click(bin('Prices'));
    expect(await screen.findByText('Delete this conversation?')).toBeTruthy();
    expect(screen.getByText("It disappears from your list. This can't be undone.")).toBeTruthy();
    expect(deleteAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteAction).toHaveBeenCalledTimes(1));
    const fd = deleteAction.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('threadId'), fd.get('active')]).toEqual([C, 't1', '1']);
  });

  it('a refused delete shows the error under its row', async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: false, error: 'Not found' });
    render(<ThreadList clientId={C} threads={threads} activeId="t1" deleteAction={deleteAction} />);
    fireEvent.click(bin('Ads'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const note = await screen.findByText('Not found');
    expect(note.closest('li')?.textContent).toContain('Ads');
    expect(note.closest('li')?.textContent).not.toContain('Prices');
    const fd = deleteAction.mock.calls[0]![1] as FormData;
    expect(fd.get('active')).toBe('0');
  });

  it('read-only hides delete', () => {
    render(
      <ReadOnlyProvider readOnly>
        <ThreadList clientId={C} threads={threads} activeId={null} deleteAction={vi.fn()} />
      </ReadOnlyProvider>,
    );
    expect(screen.queryByRole('button', { name: /Delete conversation/ })).toBeNull();
  });
});
