// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingMix } from './rating-mix';

describe('RatingMix', () => {
  it('lists 5★ to 1★ with counts and bar widths', () => {
    render(<RatingMix mix={[1, 0, 1, 2, 6]} />);
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['5★6', '4★2', '3★1', '2★0', '1★1']);
    expect((screen.getAllByTestId('bar')[0] as HTMLElement).style.width).toBe('60%');
  });

  it('says so with no reviews', () => {
    render(<RatingMix mix={[0, 0, 0, 0, 0]} />);
    expect(screen.getByText('No reviews yet.')).toBeTruthy();
  });
});
