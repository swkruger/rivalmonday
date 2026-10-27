// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientSetupView, ProfileInitial } from '../types';
import { wizardSteps } from '../wizard-steps';
import { AreaStep } from './area-step';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/c/c1/setup' }));

afterEach(cleanup);

const FRAME = { brand: { kind: 'agency' as const, name: 'Brightside Marketing', logoUrl: null, style: {} }, exitSlot: null, guide: false, steps: wizardSteps(true, 6) };
const view = (o: { needsLocation?: boolean; suggestions?: ClientSetupView['suggestions']; profile?: 'todo' | 'done' } = {}): ClientSetupView => ({
  state: { open: true, exists: true, needsLocation: o.needsLocation ?? false, steps: { details: 'done', lookup: 'done', profile: o.profile ?? 'todo', competitors: 'todo', invite: 'todo', billing: 'todo' }, competitors: 'todo', totalSteps: 6 } as ClientSetupView['state'],
  lookup: null, suggestions: o.suggestions ?? { status: 'none' }, search: null, competitorSuggestions: [], invite: { status: 'none', name: null, email: null },
  vertical: { name: 'HVAC & plumbing', services: [{ id: 'ac', name: 'AC repair' }, { id: 'heat', name: 'Heating' }], seedKeywords: ['ac repair', 'furnace repair', 'hvac contractor', 'heat pump installation', 'plumber near me', 'water heater repair'] },
});
const profile: ProfileInitial = { services: [], keywords: [], placeId: null, serviceArea: { center: { lat: 30.5, lng: -97.6 }, radiusKm: 15, zips: [], towns: [] } };
const ready = (n: number): ClientSetupView['suggestions'] => ({
  status: 'ready', services: [{ value: 'ac', quote: 'AC repair' }], keywords: Array.from({ length: n }, (_, i) => ({ value: `suggested ${i + 1}`, quote: `q${i}` })), newAreas: [], sources: ['gbp'], generatedAt: '2026-10-26T00:00:00.000Z',
});

function show(v: ClientSetupView, p: ProfileInitial = profile, onSave = vi.fn()) {
  render(<AreaStep frame={FRAME} view={v} profile={p} clientName="Cool Breeze Heating & Air" around="1801 Sam Bass Rd, Round Rock" maxKeywords={5} pending={false} error={null} onSave={onSave} />);
  return onSave;
}
const chips = () => screen.getByRole('group', { name: 'Search keywords' }).querySelectorAll('[data-chip]');

describe('AreaStep (client step 3)', () => {
  it('caps keywords at 5', () => {
    // Seven suggestions arrive: only five become chips, and the add box closes at five.
    show(view({ suggestions: ready(7) }));
    expect(chips()).toHaveLength(5);
    const box = screen.getByLabelText('Add a keyword') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/5 of 5/)).toBeTruthy();
    // Removing one opens it again; a sixth typed keyword is not added past the cap.
    fireEvent.click(screen.getByRole('button', { name: 'Remove suggested 5' }));
    expect(chips()).toHaveLength(4);
    const open = screen.getByLabelText('Add a keyword') as HTMLInputElement;
    expect(open.disabled).toBe(false);
    fireEvent.change(open, { target: { value: 'emergency hvac' } });
    fireEvent.keyDown(open, { key: 'Enter' });
    expect(chips()).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Add a keyword'), { target: { value: 'one too many' } });
    fireEvent.keyDown(screen.getByLabelText('Add a keyword'), { key: 'Enter' });
    expect(chips()).toHaveLength(5);
    expect(screen.queryByText('one too many')).toBeNull();
  });

  it('shows the seed keywords until suggestions are ready, then swaps them in only if untouched', () => {
    const { rerender } = render(<AreaStep frame={FRAME} view={view()} profile={profile} clientName="X" around={null} maxKeywords={5} pending={false} error={null} onSave={() => {}} />);
    expect([...chips()].map((c) => c.textContent)).toEqual(['ac repair✕', 'furnace repair✕', 'hvac contractor✕', 'heat pump installation✕', 'plumber near me✕']);
    rerender(<AreaStep frame={FRAME} view={view({ suggestions: ready(3) })} profile={profile} clientName="X" around={null} maxKeywords={5} pending={false} error={null} onSave={() => {}} />);
    expect([...chips()].map((c) => c.textContent)).toEqual(['suggested 1✕', 'suggested 2✕', 'suggested 3✕']);
    // Once the person edits the chips, later suggestions leave them alone.
    fireEvent.click(screen.getByRole('button', { name: 'Remove suggested 1' }));
    rerender(<AreaStep frame={FRAME} view={view({ suggestions: ready(4) })} profile={profile} clientName="X" around={null} maxKeywords={5} pending={false} error={null} onSave={() => {}} />);
    expect([...chips()].map((c) => c.textContent)).toEqual(['suggested 2✕', 'suggested 3✕']);
  });

  it('shows city field when needsLocation', () => {
    show(view({ needsLocation: true }), { ...profile, serviceArea: null });
    expect(screen.getByLabelText(/City or ZIP/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/City or ZIP/), { target: { value: 'Round Rock, TX' } });
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    show(view({ needsLocation: false }));
    expect(screen.queryByLabelText(/City or ZIP/)).toBeNull();
  });

  it('radius choices are 5, 10, 15 and 25 miles, 10 by default, and never show kilometres', () => {
    show(view());
    const group = screen.getByRole('radiogroup', { name: /Search radius/ });
    expect([...group.querySelectorAll('input')].map((i) => (i.labels?.[0]?.textContent ?? '').trim())).toEqual(['5 mi', '10 mi', '15 mi', '25 mi']);
    expect((screen.getByLabelText('10 mi') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).not.toMatch(/\bkm\b/i);
  });

  it('saves the chips, the chosen radius in kilometres and the typed location', () => {
    const onSave = show(view({ needsLocation: true, suggestions: ready(2) }), { ...profile, serviceArea: null });
    fireEvent.change(screen.getByLabelText(/City or ZIP/), { target: { value: ' Round Rock, TX ' } });
    fireEvent.click(screen.getByLabelText('15 mi'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSave).toHaveBeenCalledWith({ keywords: ['suggested 1', 'suggested 2'], radiusKm: 24.1, services: ['ac'], newAreas: [], locality: 'Round Rock, TX' });
  });

  it('services are a collapsed line that opens to the list', () => {
    show(view({ suggestions: ready(2) }));
    expect(screen.getByText('1 service from Google')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Services the business offers' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    const group = screen.getByRole('group', { name: 'Services the business offers' });
    expect((screen.getByLabelText('AC repair') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Heating') as HTMLInputElement).checked).toBe(false);
    expect(group).toBeTruthy();
  });
});
