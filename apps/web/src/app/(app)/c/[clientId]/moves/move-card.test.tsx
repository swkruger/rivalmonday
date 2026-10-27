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
  it('names the move, its status, change count and span', () => {
    render(<MoveCard move={move} selected={false} current={false} href="/x" />);
    expect(screen.getByRole('link', { name: /Territory expansion · Peachtree Air Pros/ })).toBeTruthy();
    expect(screen.getByText('Emerging · 3 changes over 21 days · confidence 55%')).toBeTruthy();
  });

  it('move card reads "Emerging · 3 changes over 21 days · confidence 55%" and singular for one', () => {
    render(<MoveCard move={{ ...move, eventCount: 1 }} selected={false} current={false} href="/x" />);
    expect(screen.getByText('Emerging · 1 change over 21 days · confidence 55%')).toBeTruthy();
  });

  it('aria-current follows current, not selected', () => {
    const { rerender } = render(<MoveCard move={move} selected current={false} href="/x" />);
    expect(screen.getByRole('link').getAttribute('aria-current')).toBeNull();
    rerender(<MoveCard move={move} selected current href="/x" />);
    expect(screen.getByRole('link').getAttribute('aria-current')).toBe('true');
  });

  it('selected row carries data-selected, others do not', () => {
    const { rerender } = render(<MoveCard move={move} selected current={false} href="/x" />);
    expect(screen.getByRole('link').getAttribute('data-selected')).toBe('true');
    rerender(<MoveCard move={move} selected={false} current={false} href="/x" />);
    expect(screen.getByRole('link').getAttribute('data-selected')).toBeNull();
  });
});
