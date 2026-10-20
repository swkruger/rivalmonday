// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
