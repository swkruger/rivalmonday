// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { brandInitials, ShellBrand } from './shell-brand';

describe('ShellBrand', () => {
  it('no logo: initials tile and the whole name, in a row that can grow', () => {
    const { container } = render(<ShellBrand displayName="CS Dev Verification Agency" logoUrl={null} whiteLabel />);
    expect(screen.getByText('CS Dev Verification Agency')).toBeTruthy();
    expect(screen.getByText('CD').getAttribute('aria-hidden')).toBe('true');
    const row = container.querySelector('[data-slot="shell-brand"]')!;
    expect(row.className).toContain('min-h-12');
    expect(row.className).not.toMatch(/(^|\s)h-12(\s|$)/);
    expect(row.className).not.toContain('truncate');
  });

  it('logo: the logo and the whole name, no initials', () => {
    render(<ShellBrand displayName="Acme Agency" logoUrl="https://acme.example/logo.png" whiteLabel />);
    expect(screen.getByRole('img', { name: 'Acme Agency' }).getAttribute('src')).toBe('https://acme.example/logo.png');
    expect(screen.getByText('Acme Agency')).toBeTruthy();
    expect(screen.queryByText('AA')).toBeNull();
  });

  it('Rival Monday keeps its wordmark', () => {
    render(<ShellBrand displayName="Rival Monday" logoUrl={null} whiteLabel={false} />);
    expect(screen.getByText('rival')).toBeTruthy();
    expect(screen.getByText('monday')).toBeTruthy();
    expect(screen.queryByText('Rival Monday')).toBeNull();
  });

  it('initials use the first two words and survive extra spaces', () => {
    expect(brandInitials('  acme   growth partners ')).toBe('AG');
    expect(brandInitials('Northwind')).toBe('N');
  });
});
