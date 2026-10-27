// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientProfileForm } from './client-profile-form';

afterEach(cleanup);

const verticals = [{ id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [{ id: 'ac_tune_up', name: 'AC tune-up' }] }];
const initial = { name: 'Comfort Air', verticalId: 'hvac_plumbing', services: ['ac_tune_up'], keywords: ['ac repair'], placeId: null, serviceArea: null };
const edit = (action: (p: never, fd: FormData) => Promise<never>) => render(<ClientProfileForm mode="edit" action={action as never} verticals={verticals} clientId="c1" initial={initial} />);

describe('ClientProfileForm save bar', () => {
  it('shows no bar until a field changes, then offers "Save profile"', () => {
    edit(vi.fn());
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Search keywords/), { target: { value: 'ac repair\nheat pump' } });
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeTruthy();
  });

  it('wires the keywords hint through aria-describedby', () => {
    edit(vi.fn());
    const ta = screen.getByLabelText('Search keywords (one per line, up to 5)');
    const hint = document.getElementById(ta.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toContain('Used for competitor discovery');
  });

  it('profile form keeps typed keywords after a refused save', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'Keywords: up to 5' }));
    edit(action as never);
    fireEvent.change(screen.getByLabelText(/Search keywords/), { target: { value: 'a\nb\nc\nd\ne\nf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Keywords: up to 5');
    expect((screen.getByLabelText(/Search keywords/) as HTMLTextAreaElement).value).toBe('a\nb\nc\nd\ne\nf');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeTruthy();
  });

  it('profile success line shows after save and the bar hides', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Profile saved.' }));
    edit(action as never);
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Comfort Air Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull();
    expect((screen.getByLabelText('Business name') as HTMLInputElement).value).toBe('Comfort Air Co');
    // typing again hides the stale success line
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Comfort Air Inc' } });
    expect(screen.queryByText('Profile saved.')).toBeNull();
  });
});
