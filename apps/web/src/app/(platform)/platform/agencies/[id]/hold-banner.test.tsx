// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const retry = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ ok: false, error: 'Billing paused for 3 subscriptions. 1 could not be paused.' })));
vi.mock('./actions', () => ({ retryHoldBillingAction: retry }));
const { HoldBanner, HoldChip } = await import('./hold-banner');

const AG = '22222222-2222-4222-8222-222222222222';
afterEach(cleanup);

describe('HoldBanner', () => {
  it('pause issue: who and since, the spec sentence and Retry billing pause', () => {
    render(<HoldBanner agencyId={AG} issue="pause" hold={{ since: 'Oct 25', byName: 'Alex' }} canRetry />);
    expect(document.body.textContent).toContain('On hold since Oct 25 by Alex.');
    expect(document.body.textContent).toContain('Billing pause failed for some subscriptions. The hold still applies.');
    expect(screen.getByRole('button', { name: 'Retry billing pause' })).toBeTruthy();
  });

  it('resume issue: the lift sentence and Retry billing resume', () => {
    render(<HoldBanner agencyId={AG} issue="resume" hold={null} canRetry />);
    expect(document.body.textContent).toContain('Billing resume failed for some subscriptions.');
    expect(document.body.textContent).not.toContain('On hold since');
    expect(screen.getByRole('button', { name: 'Retry billing resume' })).toBeTruthy();
  });

  it('Retry asks first, then shows the result in the banner', async () => {
    render(<HoldBanner agencyId={AG} issue="pause" hold={{ since: 'Oct 25', byName: 'Alex' }} canRetry />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry billing pause' }));
    expect(retry).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(retry.mock.calls[0]![1] as FormData)).toEqual({ agencyId: AG });
    expect((await screen.findByRole('alert')).textContent).toContain('1 could not be paused.');
  });
});

describe('HoldBanner for a viewer', () => {
  it('canRetry={false}: the sentence, no retry button or dialog', () => {
    render(<HoldBanner agencyId={AG} issue="pause" hold={{ since: 'Oct 25', byName: 'Alex' }} canRetry={false} />);
    expect(document.body.textContent).toContain('Billing pause failed for some subscriptions. The hold still applies.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('HoldChip', () => {
  it('a danger "On hold" chip whose accessible name carries the reason, since and by', () => {
    render(<HoldChip reason="Card declined" since="Oct 25" byName="Alex" />);
    const chip = screen.getByText('On hold');
    expect(chip.closest('[data-tone]')?.getAttribute('data-tone')).toBe('danger');
    expect(screen.getByLabelText('On hold. Reason: Card declined. Since Oct 25 · by Alex')).toBeTruthy();
  });
});
