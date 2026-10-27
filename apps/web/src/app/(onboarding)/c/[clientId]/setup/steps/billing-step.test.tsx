// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wizardSteps } from '../wizard-steps';
import { BillingStep, type BillingPrefill } from './billing-step';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/c/c1/setup' }));

afterEach(cleanup);

const FRAME = { brand: { kind: 'agency' as const, name: 'Brightside Marketing', logoUrl: null, style: {} }, exitSlot: null, guide: false, steps: wizardSteps(true, 6) };
const NOT_READY: BillingPrefill = { ready: false, priceCents: null, setupFeeCents: null };
const READY: BillingPrefill = { ready: true, priceCents: 24900, setupFeeCents: 9900 };

function show(prefill: BillingPrefill | null, o: { skipped?: boolean; onEnable?: () => void; onSkip?: () => void } = {}) {
  const onEnable = o.onEnable ?? vi.fn();
  const onSkip = o.onSkip ?? vi.fn();
  render(<BillingStep frame={FRAME} agencyName="Brightside Marketing" clientName="Cool Breeze" ownerFirstName="Maria" prefill={prefill} skipped={o.skipped ?? false} backHref="/c/c1/setup?step=invite" pending={false} error={null} onEnable={onEnable} onSkip={onSkip} />);
  return { onEnable, onSkip };
}

describe('BillingStep notes', () => {
  it('a skipped (plan-ineligible) step shows the plan note even when Connect is not ready', () => {
    show(NOT_READY, { skipped: true });
    expect(screen.getByText('Billing for clients starts once your plan is active.')).toBeTruthy();
    expect(screen.queryByText(/Connect Stripe in Settings/)).toBeNull();
  });

  it('not skipped and Connect not ready links to agency billing', () => {
    show(NOT_READY);
    expect(screen.getByRole('link', { name: 'Connect Stripe in Settings → Billing' }).getAttribute('href')).toBe('/agency/settings/billing');
  });

  it('with nothing to fill in, Continue moves on as a skip', () => {
    const { onSkip } = show(NOT_READY);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSkip).toHaveBeenCalled();
  });
});

describe('BillingStep confirm', () => {
  const openConfirm = (prefill: BillingPrefill = READY) => {
    const { onEnable } = show(prefill);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on billing' }));
    return onEnable;
  };

  it('opening the dialog does not enable billing; it names the price and setup fee', async () => {
    const onEnable = openConfirm();
    expect(await screen.findByRole('heading', { name: 'Turn on billing?' })).toBeTruthy();
    expect(screen.getByText('The owner gets an email with a payment link for $249/month plus $99 setup.')).toBeTruthy();
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('Cancel does not call onEnable', async () => {
    const onEnable = openConfirm();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Turn on billing?' })).toBeNull());
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('Confirm calls onEnable once with the typed price and fee', async () => {
    const onEnable = openConfirm();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on billing' }));
    await waitFor(() => expect(onEnable).toHaveBeenCalledTimes(1));
    expect(onEnable).toHaveBeenCalledWith('249', '99');
  });

  it('without a setup fee the body names the monthly price only', async () => {
    show({ ready: true, priceCents: 24900, setupFeeCents: null });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on billing' }));
    expect(await screen.findByText('The owner gets an email with a payment link for $249/month.')).toBeTruthy();
  });

  it('the payment preview follows the price and fee', () => {
    show(READY);
    const preview = within(screen.getByRole('complementary', { name: 'Preview' }));
    expect(preview.getByText('$249.00')).toBeTruthy();
    expect(preview.getByText('$348.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Monthly price/), { target: { value: '349' } });
    fireEvent.change(screen.getByLabelText(/Setup fee/), { target: { value: '0' } });
    expect(preview.getByText('None')).toBeTruthy();
  });

  it('the price is required before billing can be turned on', () => {
    show({ ready: true, priceCents: null, setupFeeCents: null });
    expect((screen.getByRole('button', { name: 'Turn on billing' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
