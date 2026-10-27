// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientSafeSuggestion, ClientSetupView } from '../types';
import { wizardSteps } from '../wizard-steps';
import { CompetitorsStep } from './competitors-step';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/c/c1/setup' }));

afterEach(cleanup);

const FRAME = { brand: { kind: 'agency' as const, name: 'Brightside Marketing', logoUrl: null, style: {} }, exitSlot: null, guide: false, steps: wizardSteps(true, 6) };
const sug = (id: string, name: string, o: Partial<ClientSafeSuggestion> = {}): ClientSafeSuggestion =>
  ({ id, name, tier: 'top', status: 'suggested', preTicked: false, rating: 4.5, votes: 100, distanceKm: 3.2, ...o });
const SUGGESTIONS = [
  sug('a', 'Arctic Air Comfort', { preTicked: true, rating: 4.5, votes: 486 }),
  sug('b', 'Lone Star Climate Pros', { preTicked: true, rating: 4.8, votes: 133 }),
  sug('c', 'Hill Country Heating', { tier: 'watch', preTicked: true, rating: 4.6, votes: 301 }),
  sug('d', 'Texan Comfort Systems', { tier: 'watch' }),
  sug('e', 'Round Rock Plumbing', { tier: 'minor' }),
  sug('f', 'Extra One', { tier: 'minor' }),
  sug('g', 'Extra Two', { tier: 'minor' }),
];
const view = (competitors: ClientSetupView['state']['competitors'], list: ClientSafeSuggestion[] = SUGGESTIONS, search: ClientSetupView['search'] = null): ClientSetupView => ({
  state: { open: true, exists: true, competitors, needsLocation: false, searchRefusal: null, steps: { details: 'done', lookup: 'done', profile: 'done', competitors, invite: 'todo', billing: 'todo' }, totalSteps: 6 } as ClientSetupView['state'],
  lookup: { placeId: 'p', cid: null, title: 'Cool Breeze', address: null, city: null, category: null, phone: null, domain: null, rating: 4.7, votes: 212, lat: 1, lng: 2 },
  suggestions: { status: 'none' }, search, competitorSuggestions: list, invite: { status: 'none', name: null, email: null }, vertical: { name: 'HVAC', services: [], seedKeywords: [] },
});

function show(v: ClientSetupView, o: Partial<React.ComponentProps<typeof CompetitorsStep>> = {}) {
  const props: React.ComponentProps<typeof CompetitorsStep> = {
    frame: FRAME, view: v, clientId: 'c1', clientName: 'Cool Breeze', ownerName: 'Maria', keywordCount: 4, radiusMiles: 10, backHref: '/c/c1/setup?step=profile', pending: false, error: null, refusal: null,
    onStart: vi.fn(), onSkip: vi.fn(), onContinue: vi.fn(), onAskOwner: vi.fn(), onNext: vi.fn(), ...o,
  };
  render(<CompetitorsStep {...props} />);
  return props;
}
const preview = () => screen.getByRole('complementary', { name: 'Preview' });
const rivalRows = () => [...preview().querySelectorAll('[data-role^="rival"]')];

describe('CompetitorsStep (client step 4)', () => {
  it('scorecard shows at most two rivals', () => {
    show(view('ready'));
    // Three are pre-ticked, but the scorecard draws you and the first two only (in each of its two charts).
    expect(rivalRows()).toHaveLength(4);
    const rating = within(preview().querySelector('section[aria-label="Rating"]') as HTMLElement);
    expect(rating.getByText('Arctic Air Comfort')).toBeTruthy();
    expect(rating.getByText('Lone Star Climate Pros')).toBeTruthy();
    expect(rating.queryByText('Hill Country Heating')).toBeNull();
    expect(rating.getByText('Cool Breeze (you)')).toBeTruthy();
    // Ticking more does not add a third row; unticking the first brings the next one in.
    fireEvent.click(screen.getByLabelText('Texan Comfort Systems'));
    expect(rivalRows()).toHaveLength(4);
    fireEvent.click(screen.getByLabelText('Arctic Air Comfort'));
    expect(within(preview().querySelector('section[aria-label="Rating"]') as HTMLElement).getByText('Hill Country Heating')).toBeTruthy();
  });

  it('rivals you tick fill the scorecard in the order they were ticked', () => {
    show(view('ready', SUGGESTIONS.map((s) => ({ ...s, preTicked: false }))));
    expect(rivalRows()).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Round Rock Plumbing'));
    fireEvent.click(screen.getByLabelText('Texan Comfort Systems'));
    const names = [...(preview().querySelector('section[aria-label="Rating"]') as HTMLElement).querySelectorAll('[data-role^="rival"]')].map((row) => row.firstElementChild!.textContent);
    expect(names).toEqual(['Round Rock Plumbing', 'Texan Comfort Systems']);
  });

  it('picks at most 5; the others close until one is unticked', () => {
    show(view('ready'));
    fireEvent.click(screen.getByLabelText('Texan Comfort Systems'));
    fireEvent.click(screen.getByLabelText('Round Rock Plumbing'));
    expect(screen.getByRole('button', { name: 'Continue with 5' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Hill Country Heating' }).hasAttribute('disabled')).toBe(false);
    // Only five are shown at first; "Show 2 more" reveals the rest, which are closed at the limit.
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect((screen.getByLabelText('Extra One') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Round Rock Plumbing'));
    expect((screen.getByLabelText('Extra One') as HTMLInputElement).disabled).toBe(false);
  });

  it('Continue with n sends the ticked ones in tick order', () => {
    const p = show(view('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with 3' }));
    expect(p.onContinue).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('asks the owner to pick from the footer', () => {
    const p = show(view('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Ask the owner to pick' }));
    expect(p.onAskOwner).toHaveBeenCalled();
  });

  it('while searching: progress, nothing to continue with, the scorecard has you and empty rival rows', () => {
    show(view('searching', [], { status: 'searching', progress: { searchesDone: 5, searchesTotal: 12, checksDone: 0, checksTotal: 0 }, kept: null, finishedAt: null }));
    expect(screen.getByText('Searching 4 keywords across your area…')).toBeTruthy();
    expect(screen.getByText(/5 of 12 searches/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ask the owner to pick' })).toBeTruthy();
    expect(preview().querySelectorAll('[data-role="empty"]').length).toBe(4);
  });

  it('a search that has not run or failed offers Find competitors and Skip, with the refusal in plain words', () => {
    const p = show(view('blocked', []), { refusal: 'The search took too long and was stopped. Try again, or skip this step.' });
    expect(screen.getByRole('alert').textContent).toContain('took too long');
    fireEvent.click(screen.getByRole('button', { name: 'Find competitors' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    expect(p.onStart).toHaveBeenCalled();
    expect(p.onSkip).toHaveBeenCalled();
  });

  it('after asking the owner it says who is picking and just moves on', () => {
    const p = show(view('waiting_owner'));
    expect(screen.getByText(/Maria is choosing the competitors/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask the owner to pick' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onNext).toHaveBeenCalled();
    expect(p.onContinue).not.toHaveBeenCalled();
  });

  it('zero results says so, and Continue confirms with none', () => {
    const p = show(view('ready', []));
    expect(screen.getByText(/No new businesses were found/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onContinue).toHaveBeenCalledWith([]);
  });
});
