// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ setSignupsPausedAction: async () => ({ ok: true }) }));
const { SignupsPanel, parseDays } = await import('./signups-panel');
import type { SignupRow } from './signups-panel';
afterEach(cleanup);

const row = (o: Partial<SignupRow> = {}): SignupRow => ({
  agencyId: 'a1', agencyName: 'Acme Marketing', source: 'open' as const, createdAt: '2026-11-01T10:00:00.000Z', website: null, clientsServed: '1-5' as const, check: false, ...o,
});
const funnel = { open: { signups: 4, profileDone: 3, firstClient: 2, cardAdded: 1 }, invite: { signups: 7, profileDone: 6, firstClient: 5, cardAdded: 4 }, recent: [] as SignupRow[] };
const CHECK_TIP = "No clients yet, or the agency's first client shares its website.";

describe('SignupsPanel Check column', () => {
  it('shows a Check chip with the decided tooltip text only on flagged rows; nothing is blocked', () => {
    render(<SignupsPanel paused={false} canEdit={false} days={30} funnel={{ ...funnel, recent: [row({ agencyId: 'a1', check: true, clientsServed: '0' }), row({ agencyId: 'a2', agencyName: 'Fine Co' })] }} />);
    expect(screen.getByRole('columnheader', { name: 'Check' })).toBeTruthy();
    const flagged = screen.getByRole('row', { name: /Acme Marketing/ });
    const chip = flagged.querySelector('[data-slot="status-chip"]')!;
    expect(chip.textContent).toBe('Check');
    expect(chip.getAttribute('title')).toBe(CHECK_TIP);
    expect(screen.getByRole('row', { name: /Fine Co/ }).querySelector('[data-slot="status-chip"]')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('lists website and clients served per sign-up (None yet for 0)', () => {
    render(<SignupsPanel paused={false} canEdit={false} days={30} funnel={{ ...funnel, recent: [row({ website: 'https://acme.com', clientsServed: '0', check: true })] }} />);
    const r = screen.getByRole('row', { name: /Acme Marketing/ });
    expect(r.textContent).toContain('acme.com');
    expect(r.textContent).toContain('None yet');
  });
});

describe('SignupsPanel', () => {
  it('shows both funnel rows and the range links', () => {
    render(<SignupsPanel paused={false} canEdit days={30} funnel={funnel} />);
    expect(screen.getByRole('row', { name: /Open sign-up 4 3 2 1/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /Invite link 7 6 5 4/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: '90 days' }).getAttribute('href')).toBe('/platform/billing?tab=signups&days=90');
    expect(screen.getByRole('link', { name: '30 days' }).getAttribute('aria-current')).toBe('true');
  });
  it('funnel row labels are row headers', () => {
    render(<SignupsPanel paused={false} canEdit days={30} funnel={funnel} />);
    expect(screen.getByRole('rowheader', { name: 'Open sign-up' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Invite link' })).toBeTruthy();
  });

  it('owner gets the toggle button matching the state; others see none', () => {
    const { rerender } = render(<SignupsPanel paused={false} canEdit days={30} funnel={funnel} />);
    expect(screen.getByRole('button', { name: 'Pause sign-ups' })).toBeTruthy();
    rerender(<SignupsPanel paused canEdit days={30} funnel={funnel} />);
    expect(screen.getByRole('button', { name: 'Resume sign-ups' })).toBeTruthy();
    rerender(<SignupsPanel paused canEdit={false} days={30} funnel={funnel} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('pause and resume each ask first', async () => {
    const { rerender } = render(<SignupsPanel paused={false} canEdit days={30} funnel={funnel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause sign-ups' }));
    expect((await screen.findByRole('dialog')).textContent).toContain("New agencies can't sign up until you resume. Invite links still work.");
    expect(screen.getByRole('heading', { name: 'Pause new sign-ups?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<SignupsPanel paused canEdit days={30} funnel={funnel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume sign-ups' }));
    expect(await screen.findByRole('heading', { name: 'Resume sign-ups?' })).toBeTruthy();
  });
  it('parseDays defaults to 30', () => {
    expect([parseDays(undefined), parseDays('90'), parseDays('7')]).toEqual([30, 90, 30]);
  });
});
