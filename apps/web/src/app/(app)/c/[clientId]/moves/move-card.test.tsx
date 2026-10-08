// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoveCard } from './move-card';

const move = {
  id: 'm1',
  competitorId: 'c',
  competitorName: 'Peachtree Air Pros',
  moveType: 'territory_expansion',
  label: 'Territory expansion',
  status: 'emerging' as const,
  confidence: 0.55,
  summary: '',
  eventCount: 3,
  channels: ['web', 'google_ads'],
  firstDetectedAt: '2026-09-17T00:00:00Z',
  lastEvidenceAt: '2026-10-08T00:00:00Z',
  closedAt: null,
};

describe('MoveCard', () => {
  it('names the move, its status, signal count and span', () => {
    render(<MoveCard move={move} selected={false} href="/x" />);
    expect(screen.getByRole('link', { name: /Territory expansion · Peachtree Air Pros/ })).toBeTruthy();
    expect(screen.getByText('Emerging · 3 signals over 21 days · confidence 55%')).toBeTruthy();
  });
});
