// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ setSignupsPausedAction: async () => ({ ok: true }) }));
const { SignupsPanel, parseDays } = await import('./signups-panel');
afterEach(cleanup);

const funnel = { open: { signups: 4, profileDone: 3, firstClient: 2, cardAdded: 1 }, invite: { signups: 7, profileDone: 6, firstClient: 5, cardAdded: 4 } };

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
