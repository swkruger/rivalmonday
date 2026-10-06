// @vitest-environment jsdom
import type { TrackedCompetitor } from '@cs/tools';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(),
}));
const { acceptSuggestionAction, dismissSuggestionAction, removeCompetitorAction } = await import('./actions');
const { SuggestionsPanel, TrackedCompetitorsTable } = await import('./competitor-controls');

describe('SuggestionsPanel', () => {
  it('explains what is missing before suggestions can be requested', () => {
    render(<SuggestionsPanel clientId="c1" ready={false} suggestions={[]} atLimit={false} />);
    expect(screen.getByText(/add at least one keyword and a service area/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /find competitors/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists suggestions with accept disabled at the competitor limit', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[{ id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82 }]} atLimit />);
    expect(screen.getByText('Peachtree Air')).toBeTruthy();
    expect((screen.getByRole('button', { name: /accept peachtree air/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// Final-review fix: the row that triggered the action unmounts when the page revalidates; the message must survive.
describe('row messages survive revalidation', () => {
  const suggestion = { id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82 };
  const tracked: TrackedCompetitor = { id: 'k1', name: 'Smith HVAC', domain: 'smithhvac.com', placeId: null, activePages: 0, addedAt: '2026-10-01T00:00:00.000Z' };
  beforeEach(() => vi.clearAllMocks());

  it('keeps the accept message after the suggestion row is gone', async () => {
    const msg = 'Competitor added. Website monitoring is off — only ads, reviews and Google profile data are collected.';
    vi.mocked(acceptSuggestionAction).mockResolvedValueOnce({ ok: true, message: msg });
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} />);
    fireEvent.click(screen.getByRole('button', { name: /accept peachtree air/i }));
    await waitFor(() => expect(acceptSuggestionAction).toHaveBeenCalledTimes(1));
    expect((vi.mocked(acceptSuggestionAction).mock.calls[0]![1] as FormData).get('suggestionId')).toBe('s1');
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} />);
    await waitFor(() => expect(screen.getByText(msg)).toBeTruthy());
  });

  it('keeps the dismiss message after the suggestion row is gone', async () => {
    vi.mocked(dismissSuggestionAction).mockResolvedValueOnce({ ok: true, message: 'Suggestion hidden.' });
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss peachtree air/i }));
    await waitFor(() => expect(dismissSuggestionAction).toHaveBeenCalledTimes(1));
    expect(acceptSuggestionAction).not.toHaveBeenCalled();
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} />);
    await waitFor(() => expect(screen.getByText('Suggestion hidden.')).toBeTruthy());
  });

  it('keeps the remove message after the tracked row is gone', async () => {
    vi.mocked(removeCompetitorAction).mockResolvedValueOnce({ ok: true, message: 'Competitor removed. Its history is kept.' });
    const { rerender } = render(<TrackedCompetitorsTable clientId="c1" items={[tracked]} />);
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(removeCompetitorAction).toHaveBeenCalledTimes(1));
    rerender(<TrackedCompetitorsTable clientId="c1" items={[]} />);
    await waitFor(() => expect(screen.getByText('Competitor removed. Its history is kept.')).toBeTruthy());
    expect(screen.getByText(/None yet/)).toBeTruthy();
  });

  it('shows a remove refusal inside the open dialog', async () => {
    vi.mocked(removeCompetitorAction).mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<TrackedCompetitorsTable clientId="c1" items={[tracked]} />);
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('Not found'));
  });
});
