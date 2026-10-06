// @vitest-environment jsdom
import type { AlertQueueRow } from '@cs/tools';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ approveAlertAction: vi.fn(), dismissAlertAction: vi.fn() }));
const { AlertCard } = await import('./alert-controls');

const base: AlertQueueRow = {
  id: 'a1', clientId: 'c1', clientName: 'A1 HVAC', competitorName: 'Smith HVAC', headline: 'Price cut', body: 'Smith HVAC cut tune-ups to $59.',
  score: 82, status: 'pending_review', heldForDigest: false, written: 'model', evidenceCount: 1, createdAt: '2026-10-01T00:00:00.000Z',
};

describe('AlertCard', () => {
  it('shows Approve & send for a pending_review alert', () => {
    render(<AlertCard alert={base} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
  });

  it('hides Approve & send once the alert is no longer pending_review', () => {
    render(<AlertCard alert={{ ...base, status: 'approved' }} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('shows the digest-held badge when heldForDigest is true', () => {
    render(<AlertCard alert={{ ...base, heldForDigest: true }} />);
    expect(screen.getByText('Held for the 17:00 digest')).toBeTruthy();
  });

  it('does not show the digest-held badge when heldForDigest is false', () => {
    render(<AlertCard alert={base} />);
    expect(screen.queryByText('Held for the 17:00 digest')).toBeNull();
  });

  it('shows the template note only when written is "template"', () => {
    render(<AlertCard alert={{ ...base, written: 'template' }} />);
    expect(screen.getByText(/couldn’t verify its own wording/)).toBeTruthy();
  });

  it('does not show the template note when written is "model"', () => {
    render(<AlertCard alert={base} />);
    expect(screen.queryByText(/couldn’t verify its own wording/)).toBeNull();
  });

  it('shows the score chip, client and competitor', () => {
    render(<AlertCard alert={base} />);
    expect(screen.getByText('Score 82')).toBeTruthy();
    expect(screen.getByText('A1 HVAC')).toBeTruthy();
    expect(screen.getByText('Smith HVAC')).toBeTruthy();
    expect(screen.getByText('1 evidence items')).toBeTruthy();
  });
});
