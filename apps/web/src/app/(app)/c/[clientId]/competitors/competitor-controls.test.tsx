// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(),
}));
const { SuggestionsPanel } = await import('./competitor-controls');

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
