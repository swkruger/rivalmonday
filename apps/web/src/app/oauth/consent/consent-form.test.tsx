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
  it('one workspace is shown as text with a hidden input, and Read only is the default', () => {
    const { container } = render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" options={opts(agency)} />);
    expect(screen.getByText('Agency A: all clients you can access')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect((container.querySelector('input[name="membershipId"]') as HTMLInputElement).value).toBe('m1');
    expect((container.querySelector('input[name="oauth_query"]') as HTMLInputElement).value).toBe('a=1');
    expect(checked()).toEqual(['read']);
    expect(screen.getByText(/wants to use your Cool Comfort data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByText('You can disconnect it at any time under AI connections.')).toBeTruthy();
  });

  it('15a §2.10: no agency name to show (null) drops the name instead of saying Rival Monday', () => {
    const { container } = render(<ConsentForm appName="Claude" productName={null} oauthQuery="a=1" options={opts(agency)} />);
    expect(container.textContent).toContain('Claude wants to use your data. It will act as you');
    expect(container.textContent).not.toMatch(/rival[\s-]*monday/i);
  });

  it('several workspaces use a select; access follows the chosen workspace', () => {
    render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" options={opts(agency, viewer)} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['read']);
    expect(checked()).toEqual(['read']);
    expect(screen.getByText('Read only: see changes, evidence, briefs, alerts and recommendations')).toBeTruthy();
  });

  it('the user can still pick a higher access level than the Read only default', () => {
    render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" options={opts(agency)} />);
    fireEvent.click(screen.getByRole('radio', { name: /^Read, feedback and manage/ }));
    expect(checked()).toEqual(['manage']);
  });

  it('names the redirect host, in bold, under the lead line', () => {
    render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" redirectHost="127.0.0.1:47123" options={opts(agency)} />);
    const line = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === "After you allow, you'll be sent to 127.0.0.1:47123.");
    expect(line.querySelector('strong')?.textContent).toBe('127.0.0.1:47123');
  });

  it('omits the redirect line when there is no host', () => {
    render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" redirectHost={null} options={opts(agency)} />);
    expect(screen.queryByText(/After you allow/)).toBeNull();
  });

  it('no workspace: the decided message and Cancel only', () => {
    render(<ConsentForm appName="Claude" productName="Cool Comfort" oauthQuery="a=1" options={[]} />);
    expect(screen.getByText("You don't have a workspace this app can connect to. Ask your agency to turn on AI connections for your business.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
