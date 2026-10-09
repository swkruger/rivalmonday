// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReviewItem } from './review-item';

describe('ReviewItem', () => {
  it('shows stars, business, text as published, themes and the owner reply — never a reviewer name (decision 6)', () => {
    render(
      <ReviewItem
        review={{
          reviewId: 'r', competitorId: 'x', name: 'Smith HVAC', self: false, rating: 2, text: 'Tech was late', postedAt: '2026-10-03T00:00:00.000Z',
          themes: [{ id: 'response_time', name: 'Response time' }], sentiment: 0, ownerAnswer: 'Sorry about that',
        }}
      />,
    );
    expect(screen.getByLabelText('2 of 5 stars')).toBeTruthy();
    expect(screen.getByText(/Google reviewer · Smith HVAC · Oct 3, 2026/)).toBeTruthy();
    expect(screen.getByText('Tech was late')).toBeTruthy();
    expect(screen.getByText('Response time')).toBeTruthy();
    expect(screen.getByText(/Owner replied: Sorry about that/)).toBeTruthy();
  });

  it('names the self business "You" and handles a rating-only review', () => {
    render(<ReviewItem review={{ reviewId: 'r', competitorId: 's', name: 'A1 HVAC', self: true, rating: null, text: null, postedAt: null, themes: [], sentiment: null, ownerAnswer: null }} />);
    expect(screen.getByText(/Google reviewer · You/)).toBeTruthy();
    expect(screen.getByText('No written review.')).toBeTruthy();
  });
});
