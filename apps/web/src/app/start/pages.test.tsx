// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ intake: vi.fn(), preview: vi.fn(), refresh: vi.fn() }));
vi.mock('@cs/tools', () => ({ resolveIntake: (...a: unknown[]) => m.intake(...a), getPublicPreview: (...a: unknown[]) => m.preview(...a) }));
vi.mock('@cs/engine', () => ({
  loadBranding: async () => ({ displayName: 'Smith Marketing', logoUrl: null, primary: '#123456', secondary: '#654321', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6', fromName: 'Smith Marketing' }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'test' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ turnstile: { siteKey: 'site' } }) }));
vi.mock('./actions', () => ({ lookupBusinessAction: vi.fn(), submitIntakeAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: m.refresh }),
}));

const { default: PlatformPage, metadata: platformMeta } = await import('./page');
const { default: AgencyPage, generateMetadata: agencyMeta } = await import('./[slug]/page');
const { IntakeLanding } = await import('./landing');
const { agencyBrand } = await import('./brand');
const { default: ExpiredPage } = await import('./verify/page');
const { default: PreviewPage, generateMetadata: previewMeta } = await import('./v/[leadId]/page');

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const LEAD = '11111111-1111-4111-8111-111111111111';
const agencyB = { displayName: 'Smith Marketing', logoUrl: null, primary: '#123456', secondary: '#654321', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6' };
const ready = {
  status: 'ready', self: { name: 'Smith Dental', rating: 4.5, votes: 10 },
  nearby: [{ name: 'Jones Dental', rating: 4.8, votes: 1200, distanceKm: 1.234 }],
  facts: ['1 of 1 nearby dentists has more reviews than you.'], summary: 'Jones Dental has more reviews.', category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z',
};

beforeEach(() => {
  m.intake.mockReset();
  m.preview.mockReset();
  m.intake.mockResolvedValue({ agencyId: 'A1', branding: 'agency' });
});

describe('/start (platform)', () => {
  it('shows Rival Monday, the L4 line and the form; noindex', async () => {
    const { container } = render(await PlatformPage({ searchParams: sp({ ref: 'spring' }) }));
    expect(screen.getByRole('heading', { level: 1, name: 'See how you compare with nearby rivals' })).toBeTruthy();
    expect(screen.getByText("We'll match you with a local marketing partner.")).toBeTruthy();
    expect(container.querySelector('[data-part="rival"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 3 · Find your business')).toBeTruthy();
    expect(platformMeta.robots).toEqual({ index: false, follow: false });
  });
});

describe('/start/<slug>', () => {
  it('unknown, disabled or malformed slug → 404', async () => {
    m.intake.mockResolvedValue(null);
    await expect(AgencyPage({ params: Promise.resolve({ slug: 'nope-co' }), searchParams: sp() })).rejects.toThrow('NEXT_NOT_FOUND');
    m.intake.mockClear();
    await expect(AgencyPage({ params: Promise.resolve({ slug: 'Bad Slug' }), searchParams: sp() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.intake).not.toHaveBeenCalled();
  });

  it('slug page shows agency brand: never names Rival Monday, no L4 line; title names the agency', async () => {
    const { container } = render(await AgencyPage({ params: Promise.resolve({ slug: 'smith-co' }), searchParams: sp() }));
    expect(screen.getByText('Smith Marketing')).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--primary')).toBe('#123456');
    expect(container.textContent).not.toMatch(/rival\s*monday|rivalmonday/i);
    expect(container.querySelector('[data-part="rival"]')).toBeNull();
    expect(screen.queryByText("We'll match you with a local marketing partner.")).toBeNull();
    const meta = await agencyMeta({ params: Promise.resolve({ slug: 'smith-co' }), searchParams: sp() });
    expect(meta.title).toBe('Get your free competitor snapshot · Smith Marketing');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe('/start/verify (expired)', () => {
  it('links back to the platform page, the agency page, or nowhere', async () => {
    let r = render(await ExpiredPage({ searchParams: sp() }));
    expect(screen.getByRole('heading', { level: 1, name: 'This link has expired.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start again.' }).getAttribute('href')).toBe('/start');
    r.unmount();
    r = render(await ExpiredPage({ searchParams: sp({ from: 'smith-co' }) }));
    expect(screen.getByRole('link', { name: 'Start again.' }).getAttribute('href')).toBe('/start/smith-co');
    expect(r.container.textContent).not.toMatch(/rival\s*monday/i);
    r.unmount();
    r = render(await ExpiredPage({ searchParams: sp({ from: '-' }) }));
    expect(screen.queryByRole('link')).toBeNull();
    expect(r.container.textContent).not.toMatch(/rival\s*monday/i);
    expect(r.container.querySelector('[data-part="rival"]')).toBeNull();
  });
});

describe('/start/v/<leadId>', () => {
  const open = (t: string | null = 'VIEW') => PreviewPage({ params: Promise.resolve({ leadId: LEAD }), searchParams: sp(t === null ? {} : { t }) });

  it('a bad id/token → 404; a missing token never reaches the read', async () => {
    m.preview.mockResolvedValue(null);
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.preview).toHaveBeenCalledWith('svc', LEAD, 'VIEW');
    m.preview.mockClear();
    await expect(open(null)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.preview).not.toHaveBeenCalled();
  });

  it('pending and none both show "Building your snapshot…"', async () => {
    for (const status of ['pending', 'none']) {
      m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: { status }, branding: 'platform', agencyBranding: null });
      const r = render(await open(`V-${status}`));
      expect(screen.getByRole('status').textContent).toBe('Building your snapshot…');
      r.unmount();
    }
  });

  it('ready (agency): self card, nearby table, facts, summary, agency line; no Rival Monday; no referrer', async () => {
    m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: ready, branding: 'agency', agencyBranding: agencyB });
    const { container } = render(await open('V-ready'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your competitor snapshot for Smith Dental');
    expect(screen.getByText('4.5 ★ · 10 reviews')).toBeTruthy();
    const row = screen.getByRole('row', { name: /Jones Dental/ });
    expect(row.textContent).toContain('4.8 ★');
    expect(row.textContent).toContain('1,200');
    expect(row.textContent).toContain('0.8 mi');
    expect(screen.getByRole('columnheader', { name: 'Distance' })).toBeTruthy();
    expect(screen.getByText('1 of 1 nearby dentists has more reviews than you.')).toBeTruthy();
    expect(screen.getByText('Jones Dental has more reviews.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeTruthy();
    expect(screen.getByText('Smith Marketing has your details and will be in touch about next steps.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/rival\s*monday/i);
    const meta = await previewMeta({ params: Promise.resolve({ leadId: LEAD }), searchParams: sp({ t: 'V-ready' }) });
    expect(meta).toMatchObject({ title: 'Your competitor snapshot · Smith Marketing', referrer: 'no-referrer', robots: { index: false, follow: false } });
  });

  it('lead view shows miles via formatMiles', async () => {
    m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: { ...ready, nearby: [{ name: 'Far Dental', rating: 4, votes: 5, distanceKm: 16.1 }] }, branding: 'platform', agencyBranding: null });
    render(await open('V-mi'));
    expect(screen.getByRole('row', { name: /Far Dental/ }).textContent).toContain('10 mi');
    expect(screen.getByRole('link', { name: 'Back to the start page' }).getAttribute('href')).toBe('/start');
  });

  it('ready (platform) carries the platform line; failed shows the fallback copy', async () => {
    m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: { ...ready, summary: null }, branding: 'platform', agencyBranding: null });
    let r = render(await open('V-p'));
    expect(screen.getByText("We'll match you with a local marketing partner and they'll be in touch.")).toBeTruthy();
    r.unmount();
    m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: { status: 'failed' }, branding: 'agency', agencyBranding: agencyB });
    r = render(await open('V-f1'));
    expect(screen.getByText("We couldn't build your snapshot, but Smith Marketing has your details.")).toBeTruthy();
    r.unmount();
    m.preview.mockResolvedValue({ businessName: 'Smith Dental', preview: { status: 'failed' }, branding: 'platform', agencyBranding: null });
    render(await open('V-f2'));
    expect(screen.getByText("We couldn't build your snapshot, but we have your details.")).toBeTruthy();
  });
});

describe('intake form lookup field', () => {
  it('posts exactly { place, exp, sig } for the picked business, never the hint fields', async () => {
    const { lookupBusinessAction } = await import('./actions');
    const place = { placeId: 'p1', cid: null, title: 'Smith Dental', address: null, city: null, category: 'Dentist', phone: '555', domain: 'x.com', rating: 4.5, votes: 10, lat: 1, lng: 2 };
    vi.mocked(lookupBusinessAction).mockResolvedValue({ ok: true, places: [{ place, exp: 123, sig: 'abc', isClaimed: true, possibleDuplicate: true }] } as never);
    const { container } = render(await PlatformPage({ searchParams: sp() }));
    fireEvent.change(screen.getByLabelText(/^Business name/), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByLabelText(/^City or ZIP/), { target: { value: 'Austin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Smith Dental/ }));
    expect(screen.getByText('Owner-verified')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const hidden = container.querySelector('input[name="lookup"]') as HTMLInputElement;
    expect(Object.keys(JSON.parse(hidden.value)).sort()).toEqual(['exp', 'place', 'sig']);
  });
});

describe('IntakeLanding preview', () => {
  it('preview disables submit and renders no Turnstile', () => {
    const { container } = render(<IntakeLanding brand={agencyBrand(agencyB)} slug="smith-co" refCode={null} siteKey="site" preview />);
    for (const name of ['Search', 'Get my free snapshot']) {
      const b = screen.getByRole('button', { name });
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('aria-disabled')).toBe('true');
    }
    expect(screen.getAllByText('Disabled in preview').length).toBeGreaterThan(0);
    expect(container.querySelector('.cf-turnstile')).toBeNull();
    expect(container.querySelector('input[name="lookup"]')).toBeNull();
  });

  it('start moves focus to stage 2', async () => {
    const { lookupBusinessAction } = await import('./actions');
    const place = { placeId: 'p2', cid: null, title: 'Smith Dental', address: null, city: null, category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2 };
    vi.mocked(lookupBusinessAction).mockResolvedValue({ ok: true, places: [{ place, exp: 1, sig: 's', isClaimed: false, possibleDuplicate: false }] } as never);
    render(<IntakeLanding brand={{ kind: 'platform', displayName: 'Rival Monday', logoUrl: null, style: {} }} slug={null} refCode={null} siteKey={null} />);
    fireEvent.change(screen.getByLabelText(/^Business name/), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByLabelText(/^City or ZIP/), { target: { value: 'Austin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Smith Dental/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const h = screen.getByRole('heading', { level: 1, name: 'Where should we send it?' });
    expect(screen.getByText('Step 2 of 3 · Your details')).toBeTruthy();
    expect(document.activeElement).toBe(h);
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('https://rivalmonday.app/privacy');
  });

  it('an agency intake page shows no privacy link', () => {
    render(<IntakeLanding brand={agencyBrand(agencyB)} slug="smith-co" refCode={null} siteKey={null} preview />);
    expect(screen.queryByRole('link', { name: 'Privacy policy' })).toBeNull();
  });

  const pickAndContinue = async (placeId: string) => {
    const { lookupBusinessAction } = await import('./actions');
    const place = { placeId, cid: null, title: 'Smith Dental', address: null, city: null, category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2 };
    vi.mocked(lookupBusinessAction).mockResolvedValue({ ok: true, places: [{ place, exp: 1, sig: 's', isClaimed: false, possibleDuplicate: false }] } as never);
    fireEvent.change(screen.getByLabelText(/^Business name/), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByLabelText(/^City or ZIP/), { target: { value: 'Austin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /Smith Dental/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Vera' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'vera@example.com' } });
  };

  it('step 2 requires consent: the checkbox is required and an unticked submit never reaches the action', async () => {
    const { submitIntakeAction } = await import('./actions');
    vi.mocked(submitIntakeAction).mockClear();
    render(<IntakeLanding brand={agencyBrand(agencyB)} slug="smith-co" refCode={null} siteKey={null} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    await pickAndContinue('p3');
    const consent = screen.getByRole('checkbox', { name: /I agree to be contacted about my request/ }) as HTMLInputElement;
    expect(consent.required).toBe(true);
    expect(consent.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Get my free snapshot' }));
    expect(submitIntakeAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Your snapshot link is on its way')).toBeNull();
  });

  it('step 3 shows the email, the image and a 60 s resend cooldown; Wrong email goes back to step 2', async () => {
    const { submitIntakeAction } = await import('./actions');
    vi.mocked(submitIntakeAction).mockResolvedValue({ error: null, done: true });
    render(<IntakeLanding brand={agencyBrand(agencyB)} slug="smith-co" refCode={null} siteKey={null} />);
    await pickAndContinue('p4');
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to be contacted about my request/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Get my free snapshot' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your snapshot link is on its way' })).toBeTruthy();
    expect(screen.getByText('vera@example.com')).toBeTruthy();
    expect(screen.getByText('Step 3 of 3 · Check your email')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'An open envelope with a card rising out of it and a few small sparkles.' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Resend in \d+ s$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Wrong email? Go back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Where should we send it?' })).toBeTruthy();
  });

  it('without preview the contact stage waits for a picked business and Turnstile is untouched', () => {
    render(<IntakeLanding brand={agencyBrand(agencyB)} slug="smith-co" refCode={null} siteKey="site" />);
    expect(screen.queryByRole('button', { name: 'Get my free snapshot' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
