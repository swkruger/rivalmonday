// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ decideConsent: vi.fn(async () => ({ ok: true })) }));
const { ConsentForm } = await import('./consent-form');

afterEach(cleanup);
const agency = { membershipId: 'm1', label: 'Agency A: all clients you can access', scopes: ['read', 'feedback', 'manage'] as const };
const viewer = { membershipId: 'm2', label: 'A1 HVAC (Agency A)', scopes: ['read'] as const };
const opts = (...o: { membershipId: string; label: string; scopes: readonly ('read' | 'feedback' | 'manage')[] }[]) => o.map((x) => ({ ...x, scopes: [...x.scopes] }));
const checked = () => (screen.getAllByRole('radio') as HTMLInputElement[]).filter((r) => r.checked).map((r) => r.value);

describe('ConsentForm', () => {
  it('one workspace is shown as text with a hidden input, and the highest access is the default', () => {
    const { container } = render(<ConsentForm appName="Claude" productName="Rival Monday" oauthQuery="a=1" options={opts(agency)} />);
    expect(screen.getByText('Agency A: all clients you can access')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect((container.querySelector('input[name="membershipId"]') as HTMLInputElement).value).toBe('m1');
    expect((container.querySelector('input[name="oauth_query"]') as HTMLInputElement).value).toBe('a=1');
    expect(checked()).toEqual(['manage']);
    expect(screen.getByText(/wants to use your Rival Monday data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByText('You can disconnect it at any time under AI connections.')).toBeTruthy();
  });

  it('several workspaces use a select; access follows the chosen workspace', () => {
    render(<ConsentForm appName="Claude" productName="Rival Monday" oauthQuery="a=1" options={opts(agency, viewer)} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['read']);
    expect(checked()).toEqual(['read']);
    expect(screen.getByText('Read only: see changes, evidence, briefs, alerts and recommendations')).toBeTruthy();
  });

  it('no workspace: the decided message and Cancel only', () => {
    render(<ConsentForm appName="Claude" productName="Rival Monday" oauthQuery="a=1" options={[]} />);
    expect(screen.getByText("You don't have a workspace this app can connect to. Ask your agency to turn on AI connections for your business.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
