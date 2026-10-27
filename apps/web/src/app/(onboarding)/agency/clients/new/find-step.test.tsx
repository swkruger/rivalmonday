// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FoundPlace } from './actions';
import { FindStep } from './find-step';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/agency/clients/new' }));
vi.mock('./vertical-actions', () => ({ createVerticalAction: vi.fn(), draftVerticalAction: vi.fn() }));

afterEach(cleanup);

const place = (o: Partial<FoundPlace> = {}): FoundPlace => ({
  placeId: 'ChIJcoolbreeze1', cid: null, title: 'Cool Breeze Heating & Air', address: '1801 Sam Bass Rd, Round Rock, TX 78681', city: 'Round Rock', category: 'HVAC contractor',
  phone: '+1512-555-0187', domain: 'coolbreezeac.com', rating: 4.7, votes: 212, lat: 30.5, lng: -97.6, suggestedVerticalId: 'hvac_plumbing', isClaimed: null, possibleDuplicate: false, ...o,
});
const VERTICALS = [{ id: 'hvac_plumbing', name: 'HVAC & plumbing', services: [] }, { id: 'dental', name: 'Dental practices', services: [] }];

function show(over: Partial<React.ComponentProps<typeof FindStep>> = {}) {
  const props: React.ComponentProps<typeof FindStep> = {
    kind: 'client', brand: { kind: 'agency', name: 'Brightside Marketing', logoUrl: null, style: {} }, steps: 7,
    initialName: 'Cool Breeze Heating & Air', initialLocation: 'Round Rock, TX',
    find: vi.fn().mockResolvedValue({ ok: true, places: [place(), place({ placeId: 'ChIJpoolspa0001', title: 'Cool Breeze Pool & Spa', suggestedVerticalId: null, category: 'Swimming pool contractor' })] }),
    verticals: VERTICALS, onPick: vi.fn(), onBack: vi.fn(), onCreate: vi.fn(), pending: false, result: null, canUpgrade: false, exitHref: '/agency', guide: false, ...over,
  };
  render(<FindStep {...props} />);
  return props;
}

describe('FindStep (client step 2)', () => {
  it('pre-fills search with business name', () => {
    show();
    expect((screen.getByLabelText(/Business name/) as HTMLInputElement).value).toBe('Cool Breeze Heating & Air');
    expect((screen.getByLabelText(/City or ZIP/) as HTMLInputElement).value).toBe('Round Rock, TX');
  });

  it('the search box stays editable', async () => {
    const p = show();
    fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: 'Breeze Air' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find business' }));
    await waitFor(() => expect(p.find).toHaveBeenCalledWith({ name: 'Breeze Air', location: 'Round Rock, TX' }));
  });

  it('picking a listing pre-chooses its business type and lets the step continue', async () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'Find business' }));
    const list = await screen.findByRole('list', { name: 'Matching businesses' });
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(list).getAllByRole('radio')[0]!);
    expect(p.onPick).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'ChIJcoolbreeze1' }));
    expect((screen.getByLabelText(/Business type/) as HTMLSelectElement).value).toBe('hvac_plumbing');
    expect(screen.getByText('Chosen from the Google category "HVAC contractor".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onCreate).toHaveBeenCalledWith({ lookup: expect.objectContaining({ placeId: 'ChIJcoolbreeze1' }), verticalId: 'hvac_plumbing', locality: 'Round Rock, TX' });
  });

  it('a listing with no matching type leaves the type to choose', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Find business' }));
    const list = await screen.findByRole('list', { name: 'Matching businesses' });
    fireEvent.click(within(list).getAllByRole('radio')[1]!);
    expect((screen.getByLabelText(/Business type/) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('continue without a listing needs a business type, then creates with no listing', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: /Continue without a listing/ }));
    expect(screen.getByText('Choose a business type.')).toBeTruthy();
    expect(p.onCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Business type/), { target: { value: 'dental' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue without a listing/ }));
    expect(p.onCreate).toHaveBeenCalledWith({ lookup: null, verticalId: 'dental', locality: 'Round Rock, TX' });
  });

  it('a failed search shows the alert', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    show({ find: vi.fn().mockResolvedValue({ ok: false, error: 'Lookup failed' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Find business' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lookup failed');
  });

  it('a prospect keeps the same step with its own page guide key', () => {
    show({ kind: 'prospect', steps: 6 });
    expect(screen.getByText('Step 2 of 6 · Find the business')).toBeTruthy();
  });
});
