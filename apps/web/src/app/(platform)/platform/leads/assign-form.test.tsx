// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { agencyOptionLabel, AssignForm } from './assign-form';

vi.mock('./actions', () => ({ assignLeadAction: vi.fn() }));

describe('AssignForm', () => {
  it('labels each agency with its verticals and active-client count', () => {
    expect(agencyOptionLabel({ id: 'a', name: 'Acme', verticals: ['dental', 'hvac'], activeClients: 4 })).toBe('Acme — dental, hvac · 4 active clients');
    expect(agencyOptionLabel({ id: 'b', name: 'Beta', verticals: [], activeClients: 1 })).toBe('Beta — no clients yet · 1 active client');
  });

  it('renders an agency picker and an Assign button', () => {
    render(<AssignForm leadId="l1" agencies={[{ id: 'a', name: 'Acme', verticals: ['dental'], activeClients: 2 }]} />);
    expect(screen.getByRole('option', { name: 'Acme — dental · 2 active clients' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeTruthy();
  });
});
