// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agencyOptionLabel, AssignForm, AssignScope } from './assign-form';

const m = vi.hoisted(() => ({ assign: vi.fn() }));
vi.mock('./actions', () => ({ assignLeadAction: m.assign }));

afterEach(cleanup);

const agencies = [{ id: 'a', name: 'Acme', verticals: ['Dental'], activeClients: 2 }];
const scoped = (leads: string[]) => (
  <AssignScope>{leads.map((l) => <AssignForm key={l} leadId={l} leadName={`Biz ${l}`} agencies={agencies} />)}</AssignScope>
);

describe('AssignForm', () => {
  it('labels each agency with its verticals and active-client count', () => {
    expect(agencyOptionLabel({ id: 'a', name: 'Acme', verticals: ['Dental', 'HVAC'], activeClients: 4 })).toBe('Acme — Dental, HVAC · 4 active clients');
    expect(agencyOptionLabel({ id: 'b', name: 'Beta', verticals: [], activeClients: 1 })).toBe('Beta — no clients yet · 1 active client');
  });

  it('renders an agency picker named for its lead and an Assign button', () => {
    render(scoped(['l1']));
    expect(screen.getByRole('combobox', { name: 'Agency for Biz l1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Acme — Dental · 2 active clients' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeTruthy();
  });

  it('assign success message survives revalidate', async () => {
    m.assign.mockResolvedValue({ ok: true, message: 'Assigned.' });
    const { rerender } = render(scoped(['l1', 'l2']));
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'a' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0]!);
    await waitFor(() => expect(screen.getByText('Assigned.')).toBeTruthy());
    expect((m.assign.mock.calls[0]![1] as FormData).get('leadId')).toBe('l1');
    // the revalidated list no longer has l1
    rerender(scoped(['l2']));
    expect(screen.getByText('Assigned.')).toBeTruthy();
  });
});
