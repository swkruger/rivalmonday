// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const confirmAdMatchAction = vi.fn();
const removeAdMatchAction = vi.fn();
vi.mock('@/app/(app)/c/[clientId]/competitors/actions', () => ({
  confirmAdMatchAction: (...a: unknown[]) => confirmAdMatchAction(...a),
  removeAdMatchAction: (...a: unknown[]) => removeAdMatchAction(...a),
}));
vi.mock('@/components/read-only', () => ({ useReadOnly: () => false }));
const { AdMatchChips } = await import('./ad-match-chips');

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const props = {
  clientId: 'c1', competitorId: 'x1',
  matched: [{ platform: 'google' as const, accountId: 'AR111', name: null }, { platform: 'meta' as const, accountId: '9', name: 'Peach Air' }],
  pending: [{ platform: 'meta' as const, accountId: '9001', name: 'Peach Air Atlanta', strength: 'weak' as const }],
};

describe('AdMatchChips', () => {
  it('shows matched accounts with Remove and possible ones with Confirm', () => {
    render(<AdMatchChips {...props} />);
    expect(screen.getAllByText('Matched automatically')).toHaveLength(2);
    expect(screen.getByText('Possible Meta account: Peach Air Atlanta')).toBeTruthy();
    expect(screen.getByText('Google AR111')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm Meta account Peach Air Atlanta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Google AR111' })).toBeTruthy();
  });

  it('confirm submits the account and keeps the result message mounted', async () => {
    confirmAdMatchAction.mockResolvedValue({ ok: true, message: 'Ad account confirmed.' });
    render(<AdMatchChips {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Meta account Peach Air Atlanta' }));
    await waitFor(() => expect(screen.getByText('Ad account confirmed.')).toBeTruthy());
    const fd = confirmAdMatchAction.mock.calls[0]![1] as FormData;
    expect([fd.get('clientId'), fd.get('competitorId'), fd.get('platform'), fd.get('accountId')]).toEqual(['c1', 'x1', 'meta', '9001']);
  });

  it('shows a refusal (shared competitor) as an alert', async () => {
    removeAdMatchAction.mockResolvedValue({ ok: false, error: "Other clients also track this competitor, so this account can't be removed here. Contact support." });
    render(<AdMatchChips {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Google AR111' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Contact support/);
  });

  it('renders nothing when there are no matches', () => {
    const { container } = render(<AdMatchChips {...props} matched={[]} pending={[]} />);
    expect(container.textContent).toBe('');
  });
});
