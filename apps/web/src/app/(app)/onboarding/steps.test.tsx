// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  saveProfileAction: vi.fn(async () => ({ ok: true })),
  inviteTeamAction: vi.fn(async () => ({ ok: true })),
  skipStepAction: vi.fn(async () => {}),
  continuePlanAction: vi.fn(async () => {}),
  startCheckoutAction: vi.fn(async () => ({ ok: true })),
  saveBrandingStepAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./actions', () => m);
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const { ProfileStep } = await import('./steps/profile');
const VERTICALS = [
  { id: 'hvac_plumbing', name: 'HVAC & plumbing' },
  { id: 'dental', name: 'Dental' },
];
const { TeamStep } = await import('./steps/team');
const { PlanStep } = await import('./steps/plan');
const { BrandingStep } = await import('./steps/branding');
const { Stepper } = await import('./stepper');

afterEach(() => { cleanup(); for (const f of Object.values(m)) f.mockClear(); });

const submit = async (el: HTMLElement) => { await act(async () => { fireEvent.submit(el.closest('form')!); }); };
const lastArg = (call: unknown[] | undefined) => (call as unknown[])[(call as unknown[]).length - 1] as FormData;
const profile = {
  name: 'Acme', legalName: null, website: null, contactName: 'Ann', contactRole: null, contactEmail: 'a@acme.co', phone: '', line1: null, line2: null, city: null,
  region: null, postalCode: null, country: 'US', timezone: 'America/Chicago', verticals: [], billingEmail: null, billingSameAsPostal: true,
  billingLine1: null, billingLine2: null, billingCity: null, billingRegion: null, billingPostalCode: null, billingCountry: null, taxId: null,
};

// The date formatter omits the current year, so pin "now" (Date only; timers stay real).
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

describe('Stepper', () => {
  it('shows the four steps with done/skipped state and marks the current one', () => {
    render(<Stepper current="team" steps={{ profile: 'done', team: 'open', plan: 'skipped', branding: 'open' }} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]!.textContent).toMatch(/Your agency/);
    expect(items[0]!.textContent).toMatch(/Done/);
    expect(items[2]!.textContent).toMatch(/Skipped/);
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
  });
});

describe('ProfileStep', () => {
  it('shows the decided intro and submits the form to saveProfileAction', async () => {
    render(<ProfileStep initial={profile} timezones={['America/Chicago', 'UTC']} verticalChoices={VERTICALS} />);
    expect(screen.getByText(/To save this step we need your agency name, a contact name, contact email and phone/)).toBeTruthy();
    expect((screen.getByLabelText('Agency name') as HTMLInputElement).value).toBe('Acme');
    await submit(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(m.saveProfileAction).toHaveBeenCalled());
    expect(lastArg(m.saveProfileAction.mock.calls[0]).get('name')).toBe('Acme');
  });

  it('keeps what was typed after a validation error', async () => {
    m.saveProfileAction.mockResolvedValueOnce({ ok: false, error: 'Enter a US phone number' } as never);
    render(<ProfileStep initial={profile} timezones={['America/Chicago', 'UTC']} verticalChoices={VERTICALS} />);
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'UTC' } });
    fireEvent.click(screen.getByLabelText('Dental'));
    await submit(screen.getByRole('button', { name: 'Save and continue' }));
    await screen.findByText('Enter a US phone number');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('12');
    expect((screen.getByLabelText('Time zone') as HTMLSelectElement).value).toBe('UTC');
    expect((screen.getByLabelText('Dental') as HTMLInputElement).checked).toBe(true);
  });

  it('"Billing address same as postal" is checked by default and reveals the billing address when unchecked', () => {
    render(<ProfileStep initial={profile} timezones={['UTC']} verticalChoices={VERTICALS} />);
    const box = screen.getByLabelText('Billing address same as postal') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.queryByLabelText('Billing street address')).toBeNull();
    fireEvent.click(box);
    expect(screen.getByLabelText('Billing street address')).toBeTruthy();
  });

  it('"Skip for now" posts the profile step to skipStepAction', async () => {
    render(<ProfileStep initial={profile} timezones={['UTC']} verticalChoices={VERTICALS} />);
    await submit(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('profile');
  });
});

describe('TeamStep', () => {
  it('has a role select per row, adds rows, and submits to inviteTeamAction', async () => {
    render(<TeamStep />);
    expect(screen.getAllByLabelText(/Email/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    expect(screen.getAllByLabelText(/Email/)).toHaveLength(2);
    const role = screen.getAllByLabelText(/Role/)[0] as HTMLSelectElement;
    expect(Array.from(role.options).map((o) => o.text)).toEqual(['Agency admin', 'Account manager']);
    fireEvent.change(screen.getAllByLabelText(/Email/)[0]!, { target: { value: 'x@a.co' } });
    await submit(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(m.inviteTeamAction).toHaveBeenCalled());
    expect(lastArg(m.inviteTeamAction.mock.calls[0]).getAll('email')).toEqual(['x@a.co', '']);
  });

  it('asks "Continue without inviting anyone?" when Done is pressed with no emails, and only then submits', async () => {
    render(<TeamStep />);
    await submit(screen.getByRole('button', { name: 'Done' }));
    expect(m.inviteTeamAction).not.toHaveBeenCalled();
    expect(screen.getByText('Continue without inviting anyone?')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, continue' })); });
    await waitFor(() => expect(m.inviteTeamAction).toHaveBeenCalled());
    expect(lastArg(m.inviteTeamAction.mock.calls[0]).get('confirmEmpty')).toBe('1');
  });

  it('keeps each chosen role and email after an error result (no reset to admin)', async () => {
    m.inviteTeamAction.mockResolvedValueOnce({ ok: false, error: 'x@a.co: Seat limit.' } as never);
    render(<TeamStep />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }));
    const emails = screen.getAllByLabelText(/Email/);
    fireEvent.change(emails[0]!, { target: { value: 'x@a.co' } });
    fireEvent.change(emails[1]!, { target: { value: 'y@a.co' } });
    fireEvent.change(screen.getAllByLabelText(/Role/)[1]!, { target: { value: 'account_manager' } });
    await submit(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText(/Seat limit/);
    expect((screen.getAllByLabelText(/Role/)[1] as HTMLSelectElement).value).toBe('account_manager');
    expect((screen.getAllByLabelText(/Email/)[1] as HTMLInputElement).value).toBe('y@a.co');
  });

  it('"Skip for now" posts the team step to skipStepAction', async () => {
    render(<TeamStep />);
    await submit(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('team');
  });
});

const summary = (o: Record<string, unknown> = {}) => ({
  state: 'trialing', plan: { name: 'Standard', includedSeats: 3 }, dates: { trialEndsAt: '2026-11-01T12:00:00Z', pilotEndsAt: null },
  reducedTrial: false, maxActiveClients: 3, discount: null, ...o,
});

describe('PlanStep', () => {
  it('shows state, trial end, clients included and discount; the reduced line only when reducedTrial', () => {
    const { rerender } = render(<PlanStep summary={summary({ discount: { code: 'PILOT50', couponId: 'c' } }) as never} />);
    expect(screen.getByText(/Free trial/)).toBeTruthy();
    expect(screen.getByText(/Nov 1/)).toBeTruthy();
    expect(screen.getByText(/up to 3 clients/i)).toBeTruthy();
    expect(screen.getByText(/PILOT50/)).toBeTruthy();
    expect(screen.queryByText(/During your trial you can monitor 1 client/)).toBeNull();
    rerender(<PlanStep summary={summary({ reducedTrial: true, maxActiveClients: 1 }) as never} />);
    expect(screen.getByText('During your trial you can monitor 1 client, refreshed weekly. Add a payment method to monitor up to 3, refreshed daily.')).toBeTruthy();
  });

  it('"Add payment method" posts to startCheckoutAction; "Save and continue" to continuePlanAction; skip to skipStepAction', async () => {
    render(<PlanStep summary={summary() as never} />);
    await submit(screen.getByRole('button', { name: 'Add payment method' }));
    await waitFor(() => expect(m.startCheckoutAction).toHaveBeenCalled());
    await submit(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(m.continuePlanAction).toHaveBeenCalled());
    await submit(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('plan');
  });
  it('hides "Add payment method" when the agency is already paying (active)', () => {
    render(<PlanStep summary={summary({ state: 'active', dates: { trialEndsAt: null, pilotEndsAt: null } }) as never} />);
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add payment method' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeTruthy();
  });
});

describe('BrandingStep', () => {
  it('uses the shared editor and submits to saveBrandingStepAction', async () => {
    render(<BrandingStep initial={{ displayName: 'Acme' }} agencyName="Acme" />);
    expect(screen.getByLabelText('Display name')).toBeTruthy();
    expect(screen.getByLabelText('Upload logo')).toBeTruthy();
    await submit(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(m.saveBrandingStepAction).toHaveBeenCalled());
    expect(lastArg(m.saveBrandingStepAction.mock.calls[0]).get('displayName')).toBe('Acme');
  });

  it('"Skip for now" posts the branding step to skipStepAction', async () => {
    render(<BrandingStep initial={{}} agencyName="Acme" />);
    await submit(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('branding');
  });
});
