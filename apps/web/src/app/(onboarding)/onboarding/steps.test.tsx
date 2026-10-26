// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  saveBasicsAction: vi.fn(async () => ({ ok: true })),
  inviteTeamAction: vi.fn(async () => ({ ok: true })),
  skipStepAction: vi.fn(async () => {}),
  saveBrandingStepAction: vi.fn(async () => ({ ok: true })),
  finishAction: vi.fn(async () => {}),
}));
vi.mock('./actions', () => m);
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const { AboutStep } = await import('./steps/about');
const { TeamStep } = await import('./steps/team');
const { BrandStep } = await import('./steps/brand');
const { DoneStep } = await import('./steps/done');

afterEach(() => { cleanup(); for (const f of Object.values(m)) f.mockClear(); });

/** Submits the form the button belongs to (a footer button points at its form with `form="…"`). */
const submit = async (el: HTMLElement) => {
  const form = el.closest('form') ?? document.getElementById(el.getAttribute('form')!);
  await act(async () => { fireEvent.submit(form!); });
};
const lastArg = (call: unknown[] | undefined) => (call as unknown[])[(call as unknown[]).length - 1] as FormData;
const about = { name: 'Acme', contactName: '', phone: '', contactEmail: 'a@acme.co', line1: null, line2: null, city: null, region: null, postalCode: null, billingSameAsPostal: true };
const previewOf = () => within(screen.getByRole('complementary', { name: 'Preview' }));

describe('AboutStep', () => {
  it('about step marks required fields', () => {
    render(<AboutStep initial={about} guide={false} />);
    for (const l of ['Agency name', 'Contact full name', 'Phone', 'Email address']) {
      const input = screen.getByLabelText(new RegExp(`^${l}`));
      expect(input.getAttribute('aria-required'), l).toBe('true');
      expect(document.querySelector(`label[for="${input.id}"]`)!.textContent, l).toContain('(required)');
    }
    expect(document.querySelector('label[for="line1"]')).toBeNull();
    expect(screen.getByText('Step 1 of 4 · About your agency')).toBeTruthy();
  });

  it('pre-fills the agency name and email, and keeps the address behind "+ Add an address" until it exists', () => {
    const { unmount } = render(<AboutStep initial={about} guide={false} />);
    expect((screen.getByLabelText(/^Agency name/) as HTMLInputElement).value).toBe('Acme');
    expect((screen.getByLabelText(/^Email address/) as HTMLInputElement).value).toBe('a@acme.co');
    expect(screen.queryByLabelText(/^Street address/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ Add an address' }));
    expect(screen.getByLabelText(/^Street address/)).toBeTruthy();
    unmount();
    render(<AboutStep initial={{ ...about, line1: '1 Main St', city: 'Austin', region: 'TX', postalCode: '78701' }} guide={false} />);
    expect((screen.getByLabelText(/^Street address/) as HTMLInputElement).value).toBe('1 Main St');
    expect(screen.queryByRole('button', { name: '+ Add an address' })).toBeNull();
  });

  it('submits to saveBasicsAction and updates the brief footer preview as the contact is typed', async () => {
    render(<AboutStep initial={about} guide={false} />);
    fireEvent.change(screen.getByLabelText(/^Contact full name/), { target: { value: 'Sam Lee' } });
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '(512) 555-0142' } });
    expect(previewOf().getByText('Sam Lee · Acme')).toBeTruthy();
    expect(previewOf().getByText('(512) 555-0142 · a@acme.co')).toBeTruthy();
    await submit(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(m.saveBasicsAction).toHaveBeenCalled());
    const fd = lastArg(m.saveBasicsAction.mock.calls[0]);
    expect([fd.get('name'), fd.get('contactName'), fd.get('phone'), fd.get('contactEmail')]).toEqual(['Acme', 'Sam Lee', '(512) 555-0142', 'a@acme.co']);
    expect(fd.get('billingSameAsPostal')).toBe('on');
    expect(fd.get('browserTimezone')).toBeTruthy();
  });

  it('keeps what was typed after a validation error', async () => {
    m.saveBasicsAction.mockResolvedValueOnce({ ok: false, error: 'Enter a US phone number' } as never);
    render(<AboutStep initial={about} guide={false} />);
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '12' } });
    await submit(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Enter a US phone number');
    expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe('12');
  });
});

describe('TeamStep', () => {
  const props = { agencyName: 'Acme', inviterName: 'Sam Lee', guide: false };

  it('team primary label counts invites', () => {
    render(<TeamStep {...props} />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText(/^Email/)[0]!, { target: { value: 'x@a.co' } });
    expect(screen.getByRole('button', { name: 'Send 1 invite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Add another' }));
    fireEvent.change(screen.getAllByLabelText(/^Email/)[1]!, { target: { value: 'y@a.co' } });
    expect(screen.getByRole('button', { name: 'Send 2 invites' })).toBeTruthy();
  });

  it('defaults to Account manager, offers both roles, and submits every row to inviteTeamAction', async () => {
    render(<TeamStep {...props} />);
    const role = screen.getAllByLabelText(/^Role/)[0] as HTMLSelectElement;
    expect(role.value).toBe('account_manager');
    expect(Array.from(role.options).map((o) => o.text)).toEqual(['Agency admin', 'Account manager']);
    fireEvent.change(screen.getAllByLabelText(/^Email/)[0]!, { target: { value: 'x@a.co' } });
    await submit(screen.getByRole('button', { name: 'Send 1 invite' }));
    await waitFor(() => expect(m.inviteTeamAction).toHaveBeenCalled());
    const fd = lastArg(m.inviteTeamAction.mock.calls[0]);
    expect(fd.getAll('email')).toEqual(['x@a.co']);
    expect(fd.getAll('role')).toEqual(['account_manager']);
  });

  it('the invite email preview names the agency, the inviter and the first address', () => {
    render(<TeamStep {...props} />);
    fireEvent.change(screen.getAllByLabelText(/^Email/)[0]!, { target: { value: 'jordan@a.co' } });
    expect(previewOf().getByText('To: jordan@a.co')).toBeTruthy();
    expect(previewOf().getByText('Sam Lee invited you to Acme')).toBeTruthy();
  });

  it('keeps each chosen role and email after an error result', async () => {
    m.inviteTeamAction.mockResolvedValueOnce({ ok: false, error: 'y@a.co: Seat limit.' } as never);
    render(<TeamStep {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add another' }));
    fireEvent.change(screen.getAllByLabelText(/^Email/)[0]!, { target: { value: 'x@a.co' } });
    fireEvent.change(screen.getAllByLabelText(/^Email/)[1]!, { target: { value: 'y@a.co' } });
    fireEvent.change(screen.getAllByLabelText(/^Role/)[1]!, { target: { value: 'agency_admin' } });
    await submit(screen.getByRole('button', { name: 'Send 2 invites' }));
    await screen.findByText(/Seat limit/);
    expect((screen.getAllByLabelText(/^Role/)[1] as HTMLSelectElement).value).toBe('agency_admin');
    expect((screen.getAllByLabelText(/^Email/)[1] as HTMLInputElement).value).toBe('y@a.co');
  });

  it('"Skip for now" posts the team step to skipStepAction; Back goes to step 1', async () => {
    render(<TeamStep {...props} />);
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/onboarding?step=profile');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skip for now' })); });
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('team');
  });
});

describe('BrandStep', () => {
  it('submits colour and display name to saveBrandingStepAction, and previews them live', async () => {
    render(<BrandStep initial={{ displayName: 'Acme' }} agencyName="Acme" guide={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use #0F7B6C' }));
    expect(previewOf().getByTestId('preview-dashboard-header').textContent).toContain('Acme');
    await submit(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(m.saveBrandingStepAction).toHaveBeenCalled());
    const fd = lastArg(m.saveBrandingStepAction.mock.calls[0]);
    expect([fd.get('displayName'), fd.get('primary')]).toEqual(['Acme', '#0F7B6C']);
  });

  it('has the logo upload and "Skip for now" posts the branding step', async () => {
    render(<BrandStep initial={{}} agencyName="Acme" guide={false} />);
    expect(screen.getByLabelText(/^Agency logo/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skip for now' })); });
    await waitFor(() => expect(m.skipStepAction).toHaveBeenCalled());
    expect(lastArg(m.skipStepAction.mock.calls[0]).get('step')).toBe('branding');
  });
});

describe('DoneStep', () => {
  const summary = { agency: 'Acme', contact: 'Sam Lee · (512) 555-0142', team: '1 invite sent', brand: 'Logo and colour set', brandColor: '#163A5F' };

  it('done step lists summary with edit links', () => {
    render(<DoneStep firstName="Sam" summary={summary} guide={false} />);
    expect(screen.getByRole('heading', { level: 1, name: "You're all set, Sam" })).toBeTruthy();
    const rows = Object.fromEntries(['Agency', 'Contact', 'Team', 'Brand'].map((k) => [k, screen.getByText(k, { selector: 'span' }).closest('li')!]));
    expect(rows.Agency!.textContent).toContain('Acme');
    expect(rows.Contact!.textContent).toContain('Sam Lee · (512) 555-0142');
    expect(rows.Team!.textContent).toContain('1 invite sent');
    expect(rows.Brand!.textContent).toContain('Logo and colour set');
    expect(within(rows.Agency!).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe('/onboarding?step=profile');
    expect(within(rows.Contact!).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe('/onboarding?step=profile');
    expect(within(rows.Team!).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe('/onboarding?step=team');
    expect(within(rows.Brand!).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe('/onboarding?step=branding');
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/onboarding?step=branding');
  });

  it('"Add your first client" and "Go to dashboard" both finish onboarding, with their destination', async () => {
    render(<DoneStep firstName="Sam" summary={summary} guide={false} />);
    await submit(screen.getByRole('button', { name: 'Add your first client' }));
    await waitFor(() => expect(m.finishAction).toHaveBeenCalled());
    expect(lastArg(m.finishAction.mock.calls[0]).get('to')).toBe('client');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to dashboard' })); });
    await waitFor(() => expect(m.finishAction).toHaveBeenCalledTimes(2));
    expect(lastArg(m.finishAction.mock.calls[1]).get('to')).toBe('dashboard');
  });
});
