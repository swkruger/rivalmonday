// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClientSafeSuggestion } from '../types';
import { PickStep } from './pick-step';

afterEach(cleanup);
const s = (id: string, name: string, preTicked = false) => ({ id, name, tier: 'top', status: 'suggested', preTicked, rating: null, votes: null, distanceKm: null }) as unknown as ClientSafeSuggestion;

describe('PickStep', () => {
  it('pick step counts "2 selected" as boxes are ticked', () => {
    render(<PickStep suggestions={[s('a', 'Alpha', true), s('b', 'Bravo'), s('c', 'Charlie')]} pending={false} onDone={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('1 selected');
    fireEvent.click(screen.getByLabelText('Bravo'));
    expect(screen.getByRole('status').textContent).toBe('2 selected');
  });
});
