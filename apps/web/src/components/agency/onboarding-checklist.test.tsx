// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChecklist, type ChecklistStatus } from './onboarding-checklist';

afterEach(cleanup);
const base: ChecklistStatus = {
  steps: { profile: 'done', team: 'skipped', plan: 'open', branding: 'open', first_client: 'open' },
  dismissed: false, completed: false,
};
const dismiss = vi.fn(async () => {});
const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('OnboardingChecklist', () => {
  it('renders the five items in order with progress', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Complete your agency profile');
    expect(items[1]).toContain('Invite your team');
    expect(items[2]).toContain('Review your plan');
    expect(items[3]).toContain('Add your logo and colours');
    expect(items[4]).toContain('Add your first client');
    expect(screen.getByText('1 of 5 done')).toBeTruthy();
  });

  it('ticks done items without a link; links open and skipped items to the wizard step', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(screen.queryByRole('link', { name: 'Complete your agency profile' })).toBeNull();
    expect(screen.getByTestId('step-profile').getAttribute('data-state')).toBe('done');
    expect(hrefOf('Invite your team')).toBe('/onboarding?step=team');
    expect(hrefOf('Review your plan')).toBe('/onboarding?step=plan');
    expect(hrefOf('Add your logo and colours')).toBe('/onboarding?step=branding');
    expect(hrefOf('Add your first client')).toBe('/agency/clients/new');
  });

  it('shows the payment sub-line only for the plan item while trialing', () => {
    const { rerender } = render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    expect(screen.queryByText('Add a payment method')).toBeNull();
    rerender(<OnboardingChecklist status={base} trialing dismissAction={dismiss} />);
    expect(screen.getByRole('link', { name: 'Add a payment method' }).getAttribute('href')).toBe('/onboarding?step=plan');
  });

  it('has a Dismiss button wired to the action', () => {
    render(<OnboardingChecklist status={base} trialing={false} dismissAction={dismiss} />);
    const button = screen.getByRole('button', { name: 'Dismiss' });
    expect(button.closest('form')).toBeTruthy();
  });

  it('renders nothing when completed or dismissed', () => {
    const { container, rerender } = render(<OnboardingChecklist status={{ ...base, completed: true }} trialing={false} dismissAction={dismiss} />);
    expect(container.textContent).toBe('');
    rerender(<OnboardingChecklist status={{ ...base, dismissed: true }} trialing={false} dismissAction={dismiss} />);
    expect(container.textContent).toBe('');
  });
});
