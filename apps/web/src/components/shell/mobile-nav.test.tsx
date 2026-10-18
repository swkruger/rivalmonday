// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NavRoleFlags } from './nav-items';

let pathname = '/c/11111111-1111-1111-1111-111111111111';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const { MobileNav } = await import('./mobile-nav');

const flags: NavRoleFlags = {
  isAgency: false, isAgencyAdmin: false, isUser: true, homePath: '/c/11111111-1111-1111-1111-111111111111',
  dashboard: true, alertRules: false, mcp: false,
};

describe('MobileNav (decision 14)', () => {
  it('opens a drawer with the same nav items and closes when a link is tapped', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toBeTruthy();
    const pricing = screen.getByRole('link', { name: 'Pricing' });
    fireEvent.click(pricing);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('platform zone: the drawer shows the Rival Monday wordmark and the platform sections', () => {
    pathname = '/platform/agencies';
    const operator: NavRoleFlags = { ...flags, isAgency: true, isAgencyAdmin: true, homePath: '/agency', isPlatformOperator: true };
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={operator} counts={{}} zone="platform" fallback={null} clients={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByText('rival')).toBeTruthy();
    expect(within(dialog).getByText('monday')).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Customers' })).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Agencies' }).getAttribute('aria-current')).toBe('page');
    pathname = '/c/11111111-1111-1111-1111-111111111111';
  });

  it('closes on Escape', () => {
    render(<MobileNav displayName="Rival Monday" logoUrl={null} whiteLabel={false} flags={flags} counts={{}} fallback={null} clients={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
