// @vitest-environment jsdom
import type { TrackedCompetitor } from '@cs/tools';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('./actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(), searchStatusAction: vi.fn(),
}));
const { acceptSuggestionAction, dismissSuggestionAction, removeCompetitorAction, requestSuggestionsAction, searchStatusAction } = await import('./actions');
const { SuggestionsPanel, TrackedCompetitorsTable } = await import('./competitor-controls');

describe('SuggestionsPanel', () => {
  it('explains what is missing before suggestions can be requested', () => {
    render(<SuggestionsPanel clientId="c1" ready={false} suggestions={[]} atLimit={false} canSearch />);
    expect(screen.getByText(/add at least one keyword and a service area/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /find competitors/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists suggestions with accept disabled at the competitor limit', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[{ id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82 }]} atLimit canSearch />);
    expect(screen.getByText('Peachtree Air')).toBeTruthy();
    expect((screen.getByRole('button', { name: /accept peachtree air/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('client owner views', () => {
  it('hides the paid search for client owners and shows a hint instead', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} initialSearch="idle" atLimit={false} limit={5} canSearch={false} />);
    expect(screen.queryByRole('button', { name: /Find competitors/ })).toBeNull();
    expect(screen.getByText('Your account manager can look for more competitors for you.')).toBeTruthy();
  });

  it('shows no remove button when the user may not manage competitors', () => {
    render(<TrackedCompetitorsTable clientId="c1" items={[{ id: 'x', name: 'Smith HVAC', domain: null, placeId: null, addedAt: '2026-10-01T00:00:00Z', activePages: 0 }]} canRemove={false} />);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('SuggestionsPanel search progress', () => {
  type Search = 'idle' | 'queued' | 'running' | 'done' | 'failed';
  const status = (state: Search) => ({ ok: true as const, data: { state, finishedAt: null } });
  const findButton = () => screen.getByRole('button', { name: /find competitors|searching/i }) as HTMLButtonElement;
  const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(requestSuggestionsAction).mockResolvedValue({ ok: true, message: 'queued' });
    vi.mocked(searchStatusAction).mockResolvedValue(status('running'));
  });
  afterEach(() => vi.useRealTimers());

  async function startSearch() {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch />);
    await act(async () => {
      fireEvent.click(findButton());
    });
  }

  it('shows progress and disables the button while the search runs, then reloads the suggestions when it finishes', async () => {
    await startSearch();
    expect(screen.getByText(/searching google maps/i)).toBeTruthy();
    expect(findButton().disabled).toBe(true);
    await tick(5000);
    expect(searchStatusAction).toHaveBeenCalledWith('c1');
    expect(refresh).not.toHaveBeenCalled();
    vi.mocked(searchStatusAction).mockResolvedValue(status('done'));
    await tick(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/search finished/i)).toBeTruthy();
    expect(findButton().disabled).toBe(false);
    await tick(60_000);
    expect(searchStatusAction).toHaveBeenCalledTimes(2);
  });

  it('checks every 5 seconds for the first minute, then every 10 seconds', async () => {
    await startSearch();
    await tick(60_000);
    expect(searchStatusAction).toHaveBeenCalledTimes(12);
    await tick(20_000);
    expect(searchStatusAction).toHaveBeenCalledTimes(14);
  });

  it('says so and re-enables the button when the search fails', async () => {
    vi.mocked(searchStatusAction).mockResolvedValue(status('failed'));
    await startSearch();
    await tick(5000);
    expect(screen.getByRole('alert').textContent).toMatch(/search failed/i);
    expect(findButton().disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('stops after 10 minutes and asks to check back later', async () => {
    await startSearch();
    await tick(10 * 60_000 + 10_000);
    const calls = vi.mocked(searchStatusAction).mock.calls.length;
    expect(screen.getByText(/still searching/i)).toBeTruthy();
    expect(findButton().disabled).toBe(false);
    await tick(60_000);
    expect(searchStatusAction).toHaveBeenCalledTimes(calls);
  });

  it('picks up a search that was already running when the page loaded', async () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} initialSearch="running" canSearch />);
    expect(screen.getByText(/searching google maps/i)).toBeTruthy();
    vi.mocked(searchStatusAction).mockResolvedValue(status('done'));
    await tick(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not poll when no search is running', async () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} initialSearch="done" canSearch />);
    await tick(30_000);
    expect(searchStatusAction).not.toHaveBeenCalled();
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
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} canSearch />);
    fireEvent.click(screen.getByRole('button', { name: /accept peachtree air/i }));
    await waitFor(() => expect(acceptSuggestionAction).toHaveBeenCalledTimes(1));
    expect((vi.mocked(acceptSuggestionAction).mock.calls[0]![1] as FormData).get('suggestionId')).toBe('s1');
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch />);
    await waitFor(() => expect(screen.getByText(msg)).toBeTruthy());
  });

  it('keeps the dismiss message after the suggestion row is gone', async () => {
    vi.mocked(dismissSuggestionAction).mockResolvedValueOnce({ ok: true, message: 'Suggestion hidden.' });
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} canSearch />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss peachtree air/i }));
    await waitFor(() => expect(dismissSuggestionAction).toHaveBeenCalledTimes(1));
    expect(acceptSuggestionAction).not.toHaveBeenCalled();
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch />);
    await waitFor(() => expect(screen.getByText('Suggestion hidden.')).toBeTruthy());
  });

  it('keeps the remove message after the tracked row is gone', async () => {
    vi.mocked(removeCompetitorAction).mockResolvedValueOnce({ ok: true, message: 'Competitor removed. Its history is kept.' });
    const { rerender } = render(<TrackedCompetitorsTable clientId="c1" items={[tracked]} canRemove />);
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(removeCompetitorAction).toHaveBeenCalledTimes(1));
    rerender(<TrackedCompetitorsTable clientId="c1" items={[]} canRemove />);
    await waitFor(() => expect(screen.getByText('Competitor removed. Its history is kept.')).toBeTruthy());
    expect(screen.getByText(/None yet/)).toBeTruthy();
  });

  it('shows a remove refusal inside the open dialog', async () => {
    vi.mocked(removeCompetitorAction).mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<TrackedCompetitorsTable clientId="c1" items={[tracked]} canRemove />);
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('Not found'));
  });
});
