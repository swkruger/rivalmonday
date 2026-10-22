// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClientSetupView } from '../types';
import { BusinessStep, inSentence } from './business-step';

afterEach(cleanup);

const baseView = (suggestions: ClientSetupView['suggestions']): ClientSetupView => ({
  state: { open: true, exists: true } as ClientSetupView['state'],
  lookup: null,
  suggestions,
  search: null,
  competitorSuggestions: [],
  invite: { status: 'none', name: null, email: null },
  vertical: { name: 'Dental practices', services: [{ id: 'implants', name: 'Implants' }], seedKeywords: ['dentist near me', 'teeth whitening'] },
});
const profile = { services: [], keywords: [], placeId: null, serviceArea: null };
const show = (s: ClientSetupView['suggestions']) => render(<BusinessStep view={baseView(s)} profile={profile} pending={false} onSave={() => {}} />);
const advanced = () => screen.getByText('Advanced').closest('details') as HTMLDetailsElement;
const ready = (services: { value: string; quote: string }[], keywords: { value: string; quote: string }[]): ClientSetupView['suggestions'] => ({
  status: 'ready', services, keywords, newAreas: [], sources: ['gbp'], generatedAt: '2026-10-17T00:00:00.000Z',
});
const NOTE = "We couldn't find suggestions in the Google profile — here are common keywords for dental practices.";

describe('inSentence', () => {
  it('lowercases words for mid-sentence use but keeps all-caps tokens', () => {
    expect(inSentence('HVAC & Plumbing')).toBe('HVAC & plumbing');
    expect(inSentence('Dental practices')).toBe('dental practices');
  });
});

describe('BusinessStep suggestions note', () => {
  it('ready with nothing found: note names the vertical and the seed chips are unticked', () => {
    show(ready([], []));
    const note = screen.getByRole('status');
    expect(note.textContent).toBe(NOTE);
    for (const k of ['dentist near me', 'teeth whitening']) {
      expect((screen.getByLabelText(k) as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.queryByText(/We pre-ticked/)).toBeNull();
  });

  it('ready with keywords: no note, keywords pre-ticked', () => {
    show(ready([], [{ value: 'implant dentist', quote: 'implant dentist' }]));
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByText(/We pre-ticked/)).toBeTruthy();
    expect((screen.getByLabelText('implant dentist') as HTMLInputElement).checked).toBe(true);
  });

  it('pending shows only the reading line', () => {
    show({ status: 'pending' });
    expect(screen.getByRole('status').textContent).toBe('Reading your Google profile…');
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe('BusinessStep new areas (14a)', () => {
  const withNew = (names: string[]): ClientSetupView['suggestions'] => ({
    status: 'ready', services: [], keywords: [], newAreas: names.map((name) => ({ name, quote: name })), sources: ['gbp'], generatedAt: '2026-10-17T00:00:00.000Z',
  });

  it('shows unticked New chips with the help text', () => {
    show(withNew(['Duct sealing']));
    const box = screen.getByRole('checkbox', { name: /Duct sealing/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.name).toBe('newAreas');
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Not in our list yet. Tick to add it as a service; our team reviews new ones.')).toBeTruthy();
  });

  it('hides a new chip once the vertical already lists an area of that name', () => {
    show(withNew(['implants']));
    expect(screen.queryByText('New')).toBeNull();
  });
});

describe('BusinessStep Advanced disclosure', () => {
  it('is closed by default, holds the map centre and place id, each with a hint', () => {
    show({ status: 'none' } as ClientSetupView['suggestions']);
    const d = advanced();
    expect(d.open).toBe(false);
    expect(d.contains(screen.getByLabelText(/Map centre/))).toBe(true);
    expect(d.contains(screen.getByLabelText('Google place id'))).toBe(true);
    expect(screen.getByLabelText(/Map centre/).getAttribute('aria-describedby')).toBe('center-hint');
    expect(screen.getByLabelText('Google place id').getAttribute('aria-describedby')).toBe('placeId-hint');
    expect(document.getElementById('center-hint')!.textContent).toBeTruthy();
    expect(document.getElementById('placeId-hint')!.textContent).toBeTruthy();
    expect(d.contains(screen.getByLabelText(/radius/i))).toBe(false);
  });

  it('opens when the save error is about the centre, stays closed for a radius error', () => {
    const view = baseView({ status: 'none' } as ClientSetupView['suggestions']);
    const { rerender } = render(<BusinessStep view={view} profile={profile} pending={false} onSave={() => {}} error="Radius must be between 2 and 25 miles." />);
    expect(advanced().open).toBe(false);
    rerender(<BusinessStep view={view} profile={profile} pending={false} onSave={() => {}} error={'Enter the centre as "latitude, longitude" (e.g. 33.95, -84.33)'} />);
    expect(advanced().open).toBe(true);
  });

  it('still submits the centre and place id values while closed', () => {
    let fd: FormData | undefined;
    render(<BusinessStep view={baseView({ status: 'none' } as ClientSetupView['suggestions'])} profile={{ ...profile, placeId: 'ChIJabc' }} pending={false} onSave={(f) => { fd = f; }} />);
    fireEvent.change(screen.getByLabelText(/Map centre/), { target: { value: '33.95, -84.33' } });
    fireEvent.submit(screen.getByRole('button', { name: /Save and find competitors/ }).closest('form')!);
    expect(fd!.get('center')).toBe('33.95, -84.33');
    expect(fd!.get('placeId')).toBe('ChIJabc');
  });
});
