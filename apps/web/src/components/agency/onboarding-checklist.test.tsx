// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChecklist, type ChecklistStatus } from './onboarding-checklist';

afterEach(cleanup);
const base: ChecklistStatus = {
  steps: { profile: 'done', team: 'skipped', plan: 'skipped', branding: 'skipped', first_client: 'open' },
  dismissed: false, completed: false,
};
const dismiss = vi.fn(async () => {});
const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
const labels = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('OnboardingChecklist', () => {
  it('shows only open items', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(labels()).toEqual(['○Add your first client', '○Invite your teamskipped', '○Add your logo and coloursskipped']);
    expect(screen.getByText('3 left to do')).toBeTruthy();
    expect(hrefOf('Add your first client')).toBe('/agency/clients/new');
    expect(hrefOf('Invite your team')).toBe('/agency/settings/team');
    expect(hrefOf('Add your logo and colours')).toBe('/agency/settings/branding');
    expect(screen.queryByText('Review your plan')).toBeNull();
  });

  it('skipped team item links to settings', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(hrefOf('Invite your team')).toBe('/agency/settings/team');
  });

  it('checklist shows profile item while open', () => {
    render(<OnboardingChecklist status={{ ...base, steps: { ...base.steps, profile: 'open' } }} trialing={false} dismissAction={dismiss} />);
    expect(labels()[0]).toContain('Finish your agency details');
    expect(hrefOf('Finish your agency details')).toBe('/onboarding');
  });

  it('team and branding appear only when skipped; done steps and a finished first client drop out', () => {
    render(<OnboardingChecklist status={{ ...base, steps: { ...base.steps, team: 'done', branding: 'open', first_client: 'done' } }} trialing dismissAction={dismiss} />);
    expect(labels()).toEqual(['○Add a payment method']);
  });

  it('adds the payment item only while on the trial', () => {
    const { rerender } = render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(screen.queryByText('Add a payment method')).toBeNull();
    rerender(<OnboardingChecklist status={base} trialing dismissAction={dismiss} />);
    expect(labels()[1]).toContain('Add a payment method');
    expect(hrefOf('Add a payment method')).toBe('/agency/settings/billing');
  });

  it('has a Dismiss button wired to the action', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(screen.getByRole('button', { name: 'Dismiss' }).closest('form')).toBeTruthy();
  });

  it('hides when nothing open', () => {
    const none = { ...base, steps: { profile: 'done', team: 'done', plan: 'skipped', branding: 'done', first_client: 'done' } } as ChecklistStatus;
    const { container, rerender } = render(<OnboardingChecklist status={none} trialing={false} dismissAction={dismiss} />);
    expect(container.textContent).toBe('');
    // a completed onboarding still shows what is open (completed no longer hides the card), but dismissed does
    rerender(<OnboardingChecklist status={{ ...base, completed: true }} trialing={false} dismissAction={dismiss} />);
    expect(container.textContent).toContain('Add your first client');
    rerender(<OnboardingChecklist status={{ ...base, dismissed: true }} trialing={false} dismissAction={dismiss} />);
    expect(container.textContent).toBe('');
  });
});
