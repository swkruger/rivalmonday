// @vitest-environment jsdom
import type { SuggestionView, TrackedCompetitor } from '@cs/tools';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('./actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionsAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(), searchStatusAction: vi.fn(),
}));
const { acceptSuggestionsAction, dismissSuggestionAction, removeCompetitorAction, requestSuggestionsAction, searchStatusAction } = await import('./actions');
const { SuggestionsPanel, TrackedCompetitorsTable } = await import('./competitor-controls');

const NO_SIGNALS = {
  rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
  metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
};
const suggestion: SuggestionView = {
  id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82,
  tier: 'top', category: null, distanceKm: null, signals: NO_SIGNALS, adMatches: [], preselected: false,
};

describe('SuggestionsPanel', () => {
  it('explains what is missing before suggestions can be requested', () => {
    render(<SuggestionsPanel clientId="c1" ready={false} suggestions={[]} atLimit={false} canSearch />);
    expect(screen.getByText(/add keywords, a service area and a google place id to search/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /find competitors/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists suggestions with tracking disabled at the competitor limit', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit canSearch />);
    expect(screen.getByText('Peachtree Air')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /track peachtree air/i }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText('This client already tracks 5 competitors').length).toBeGreaterThan(0);
  });
});

describe('weekly search limit', () => {
  it('shows the button disabled with the next allowed day when this week\'s manual search is used', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch nextSearchLabel="Mon 20 Oct" />);
    const button = screen.getByRole('button', { name: 'Next search available Mon 20 Oct' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /find competitors/i })).toBeNull();
  });

  it('a running search still shows Searching… rather than the next day', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch initialSearch="running" nextSearchLabel="Mon 20 Oct" />);
    expect(screen.getByRole('button', { name: /searching/i })).toBeTruthy();
  });

  it('shows Find competitors when no limit applies', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch nextSearchLabel={null} />);
    expect((screen.getByRole('button', { name: 'Find competitors' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('client owner views', () => {
  it('hides the paid search for client owners and shows a hint instead', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} initialSearch="idle" atLimit={false} limit={5} canSearch={false} />);
    expect(screen.queryByRole('button', { name: /Find competitors/ })).toBeNull();
    expect(screen.getByText('Your account manager can look for more competitors for you.')).toBeTruthy();
  });

  it('never polls the search status when canSearch is false, even if a search is running', async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    try {
      render(<SuggestionsPanel clientId="c1" ready suggestions={[]} initialSearch="running" atLimit={false} limit={5} canSearch={false} />);
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(searchStatusAction).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no remove button when the user may not manage competitors', () => {
    render(<TrackedCompetitorsTable clientId="c1" items={[{ id: 'x', name: 'Smith HVAC', domain: null, placeId: null, addedAt: '2026-10-01T00:00:00Z', activePages: 0 }]} canRemove={false} />);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('SuggestionsPanel search progress', () => {
  type Search = 'idle' | 'queued' | 'running' | 'done' | 'failed';
  const status = (state: Search, extra: Partial<{ stage: string; searchesDone: number; searchesTotal: number; checksTotal: number }> = {}) => ({
    ok: true as const,
    data: { state, stage: 'searching', searchesDone: 0, searchesTotal: 0, checksTotal: 0, finishedAt: null, ...extra },
  });
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
    expect(screen.getByText(/searching your area/i)).toBeTruthy();
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

  it('shows search counts, then the checking copy', async () => {
    vi.mocked(searchStatusAction).mockResolvedValue(status('running', { searchesDone: 140, searchesTotal: 245 }));
    await startSearch();
    await tick(5000);
    expect(screen.getByText('Searching your area… 140 of 245 searches')).toBeTruthy();
    vi.mocked(searchStatusAction).mockResolvedValue(status('running', { stage: 'checking', checksTotal: 20 }));
    await tick(5000);
    expect(screen.getByText('Checking ads and reviews for 20 businesses…')).toBeTruthy();
  });

  it('says so and re-enables the button when the search fails', async () => {
    vi.mocked(searchStatusAction).mockResolvedValue(status('failed'));
    await startSearch();
    await tick(5000);
    expect(screen.getByRole('alert').textContent).toMatch(/search didn't finish/i);
    expect(findButton().disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a search already failed on page load shows passively: role=status, no focus', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} initialSearch="failed" canSearch />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/search didn't finish/i);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps polling past 30 minutes, stops after 60 and asks to check back later', async () => {
    await startSearch();
    await tick(30 * 60_000);
    expect(screen.queryByText(/still searching/i)).toBeNull();
    await tick(30 * 60_000 + 10_000);
    const calls = vi.mocked(searchStatusAction).mock.calls.length;
    expect(screen.getByText(/still searching/i)).toBeTruthy();
    expect(findButton().disabled).toBe(false);
    await tick(60_000);
    expect(searchStatusAction).toHaveBeenCalledTimes(calls);
  });

  it('sets expectations: a full search takes 20–40 minutes and the page can be left', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} initialSearch="done" canSearch />);
    expect(screen.getByText('A full search runs hundreds of map lookups and usually takes 20–40 minutes. You can leave this page.')).toBeTruthy();
  });

  it('picks up a search that was already running when the page loaded', async () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} initialSearch="running" canSearch />);
    expect(screen.getByText(/searching your area/i)).toBeTruthy();
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
  const tracked: TrackedCompetitor = { id: 'k1', name: 'Smith HVAC', domain: 'smithhvac.com', placeId: null, activePages: 0, addedAt: '2026-10-01T00:00:00.000Z' };
  beforeEach(() => vi.clearAllMocks());

  it('keeps the track-selected message after the suggestion row is gone', async () => {
    const msg = '1 competitor added. Website monitoring is off — only ads, reviews and Google profile data are collected.';
    vi.mocked(acceptSuggestionsAction).mockResolvedValueOnce({ ok: true, message: msg });
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} canSearch />);
    fireEvent.click(screen.getByRole('checkbox', { name: /track peachtree air/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Track selected (1)' }));
    await waitFor(() => expect(acceptSuggestionsAction).toHaveBeenCalledWith('c1', ['s1']));
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch />);
    await waitFor(() => expect(screen.getByText(msg)).toBeTruthy());
  });

  it('keeps the dismiss message after the suggestion row is gone', async () => {
    vi.mocked(dismissSuggestionAction).mockResolvedValueOnce({ ok: true, message: 'Suggestion hidden.' });
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={[suggestion]} atLimit={false} canSearch />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss peachtree air/i }));
    await waitFor(() => expect(dismissSuggestionAction).toHaveBeenCalledTimes(1));
    expect(acceptSuggestionsAction).not.toHaveBeenCalled();
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
    expect(screen.getByText(/Add one with the form below/)).toBeTruthy();
  });

  it('shows a remove refusal inside the open dialog', async () => {
    vi.mocked(removeCompetitorAction).mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<TrackedCompetitorsTable clientId="c1" items={[tracked]} canRemove />);
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /stop tracking/i }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('Not found'));
  });
});

describe('SuggestionsPanel tiers and selection', () => {
  const mk = (id: string, name: string, tier: SuggestionView['tier'], preselected = false): SuggestionView => ({ ...suggestion, id, name, tier, preselected });
  const list = [mk('a', 'Alpha', 'top', true), mk('b', 'Bravo', 'top', true), mk('c', 'Charlie', 'watch'), mk('d', 'Delta', 'minor')];

  it('renders groups in order with headings only for non-empty tiers', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[list[3]!, list[2]!, list[0]!]} atLimit={false} canSearch />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Top rival · 1', 'Worth watching · 1', 'Minor · 1']);
    cleanup();
    render(<SuggestionsPanel clientId="c1" ready suggestions={[list[3]!]} atLimit={false} canSearch />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Minor · 1']);
  });

  it('group headings carry the count and a coloured bar; only Top rival has the hint; cards have no tier chip', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} canSearch />);
    const top = screen.getByRole('heading', { name: 'Top rival · 2' });
    expect(top.parentElement?.querySelector('[aria-hidden="true"]')?.className).toContain('bg-ink');
    expect(screen.getByRole('heading', { name: 'Worth watching · 1' }).parentElement?.querySelector('[aria-hidden="true"]')?.className).toContain('bg-primary');
    expect(screen.getByRole('heading', { name: 'Minor · 1' }).parentElement?.querySelector('[aria-hidden="true"]')?.className).toContain('bg-muted-ink');
    expect(screen.getAllByText('close by, same services, active')).toHaveLength(1);
    const card = screen.getByRole('checkbox', { name: /track alpha/i }).closest('li')!;
    expect(within(card as HTMLElement).queryByText('Top rival')).toBeNull();
  });

  it('the Track selected bar is dark with a white button', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} limit={5} trackedCount={3} canSearch />);
    const button = screen.getByRole('button', { name: 'Track selected (2)' });
    expect(button.className).toContain('bg-white');
    expect(button.className).toContain('text-ink');
    expect(button.parentElement?.className).toContain('bg-ink');
    expect(screen.getByText('You can track 2 more.').className).toContain('text-[#E2E8F0]');
  });

  it('pre-ticks preselected and counts them in Track selected', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} canSearch />);
    expect((screen.getByRole('checkbox', { name: /track alpha/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /track bravo/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /track charlie/i }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Track selected (2)' })).toBeTruthy();
  });

  it('stops offering unticked boxes once the room under the limit is used', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} limit={5} trackedCount={3} canSearch />);
    expect((screen.getByRole('checkbox', { name: /track charlie/i }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: /track alpha/i }) as HTMLInputElement).disabled).toBe(false);
  });

  it('says how many more can be tracked once the room is used', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} limit={5} trackedCount={3} canSearch />);
    expect(screen.getByText('You can track 2 more.')).toBeTruthy();
  });

  it('keeps the user ticks for surviving ids when the list changes', () => {
    const { rerender } = render(<SuggestionsPanel clientId="c1" ready suggestions={list} atLimit={false} canSearch />);
    fireEvent.click(screen.getByRole('checkbox', { name: /track alpha/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /track charlie/i }));
    rerender(<SuggestionsPanel clientId="c1" ready suggestions={[list[0]!, list[1]!, list[2]!]} atLimit={false} canSearch />);
    expect((screen.getByRole('checkbox', { name: /track alpha/i }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /track bravo/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /track charlie/i }) as HTMLInputElement).checked).toBe(true);
  });

  it('hidden list shows reason labels', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch hiddenList={[{ name: 'Dollar General', reason: 'wrong_category' }, { name: 'Lone Star Air', reason: 'self' }]} />);
    expect(screen.getByText('Show 2 hidden')).toBeTruthy();
    expect(screen.getByText('Different kind of business')).toBeTruthy();
    expect(screen.getByText('This is your business')).toBeTruthy();
  });

  it('shows the decided empty copy', () => {
    render(<SuggestionsPanel clientId="c1" ready suggestions={[]} atLimit={false} canSearch />);
    expect(screen.getByText('No competitors found yet. Add keywords and a service area, then search.')).toBeTruthy();
  });
});

describe('TrackedCompetitorsTable ratings', () => {
  const tracked: TrackedCompetitor = { id: 'x1', name: 'Smith HVAC', domain: 'smith.example', placeId: null, addedAt: '2026-09-01T00:00:00.000Z', activePages: 2 };
  const other: TrackedCompetitor = { ...tracked, id: 'x2', name: 'Jones Air' };
  const rating = { competitorId: 'x1', tier: 'top' as const, signals: { ...NO_SIGNALS, rating: 4.7, votes: 90 }, computedAt: '2026-10-13T09:00:00.000Z' };

  it('client user sees a tier pill after the name, no Tier column, no match chips', () => {
    render(<TrackedCompetitorsTable clientId="c1" items={[tracked, other]} canRemove={false} signals={[rating]} />);
    expect(screen.queryByRole('columnheader', { name: /^Tier/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /^Signals/ })).toBeTruthy();
    const nameCell = screen.getByRole('link', { name: 'Smith HVAC' }).closest('td')!;
    expect(within(nameCell as HTMLElement).getByText('Top rival')).toBeTruthy();
    expect(within(nameCell as HTMLElement).getByText('Rated Tue 13 Oct')).toBeTruthy();
    expect(screen.getAllByRole('list', { name: 'Signals' })).toHaveLength(1);
    expect(screen.queryByText(/Matched automatically|Possible .* account/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('says "Not rated yet" for a competitor with no signal row, never a tier', () => {
    render(<TrackedCompetitorsTable clientId="c1" items={[other]} canRemove={false} signals={[rating]} />);
    expect(screen.getByText('Not rated yet')).toBeTruthy();
    expect(screen.queryByText('Minor')).toBeNull();
  });

  it('is a flat list ordered Top rival, Worth watching, Minor, not rated, then by name', () => {
    const mk = (id: string, name: string): TrackedCompetitor => ({ ...tracked, id, name });
    const items = [mk('n1', 'Zulu Unrated'), mk('m1', 'Minor Co'), mk('w2', 'Watch Beta'), mk('t1', 'Top Zed'), mk('w1', 'Watch Alpha'), mk('n0', 'Alpha Unrated'), mk('t0', 'Top Able')];
    const sig = (competitorId: string, tier: 'top' | 'watch' | 'minor') => ({ ...rating, competitorId, tier });
    render(<TrackedCompetitorsTable clientId="c1" items={items} canRemove={false} signals={[sig('m1', 'minor'), sig('w2', 'watch'), sig('t1', 'top'), sig('w1', 'watch'), sig('t0', 'top')]} />);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Top Able', 'Top Zed', 'Watch Alpha', 'Watch Beta', 'Minor Co', 'Alpha Unrated', 'Zulu Unrated']);
    // No group rows: one row per competitor plus the header.
    expect(screen.getAllByRole('row')).toHaveLength(items.length + 1);
  });
});

describe('TrackedCompetitorsTable empty state by viewer', () => {
  const names = { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' };
  afterEach(cleanup);

  it('a read-only agency viewer gets an explanation, not a blank block', async () => {
    const { HelpProvider } = await import('@/components/help/help-context');
    render(<HelpProvider value={{ audience: 'agency', names }}><TrackedCompetitorsTable clientId="c1" items={[]} canRemove={false} /></HelpProvider>);
    expect(screen.getByRole('heading', { name: 'No competitors tracked yet' })).toBeTruthy();
    expect(screen.getByText(/No competitors are tracked for Lone Star Cooling yet\. This session is read-only/)).toBeTruthy();
  });

  it('a view-only client is told their agency sets competitors up', async () => {
    const { HelpProvider } = await import('@/components/help/help-context');
    render(<HelpProvider value={{ audience: 'client', names }}><TrackedCompetitorsTable clientId="c1" items={[]} canRemove={false} /></HelpProvider>);
    expect(screen.getByText('Your competitors appear here once Cool Comfort has set them up.')).toBeTruthy();
    expect(screen.queryByText(/read-only/)).toBeNull();
  });
});
