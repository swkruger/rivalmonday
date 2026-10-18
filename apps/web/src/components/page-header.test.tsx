// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

afterEach(cleanup);

describe('PageHeader (15a §2.7)', () => {
  it('renders exactly one h1 with the title, and the description', () => {
    render(<PageHeader title="Approvals" description="Briefs waiting for you." />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('Approvals');
    expect(h1s[0]!.className).toContain('text-[26px]');
    expect(h1s[0]!.className).toContain('font-extrabold');
    const description = screen.getByText('Briefs waiting for you.');
    expect(description.className).toContain('text-muted-ink');
  });

  it('renders no breadcrumb nav, step line or description when none is given', () => {
    const { container } = render(<PageHeader title="Portfolio" />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/^Step /)).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders the breadcrumb as a labelled nav: links for crumbs with an href, the last crumb as the current page', () => {
    render(<PageHeader title="Team" breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Team' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const link = within(nav).getByRole('link', { name: 'Agency settings' });
    expect(link.getAttribute('href')).toBe('/agency/settings');
    const current = within(nav).getByText('Team');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(within(nav).queryByRole('link', { name: 'Team' })).toBeNull();
    // The `›` separators are decorative.
    expect(nav.textContent).toContain('›');
    for (const sep of nav.querySelectorAll('[aria-hidden="true"]')) expect(sep.textContent).toBe('›');
  });

  it('a middle crumb without an href is plain text, and the last crumb is never a link even with an href', () => {
    render(<PageHeader title="Acme" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Customers' }, { label: 'Acme', href: '/platform/agencies/x' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Platform']);
    expect(within(nav).getByText('Customers').getAttribute('aria-current')).toBeNull();
    expect(within(nav).getByText('Acme').getAttribute('aria-current')).toBe('page');
  });

  it('lets a long unbroken crumb (an Ask thread title with a URL) shrink and truncate instead of widening the page', () => {
    const long = `What changed on https://example.com/${'a1b2'.repeat(60)}`;
    render(<PageHeader title="Ask Friday" breadcrumb={[{ label: 'Acme', href: '/c/x' }, { label: long }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const current = within(nav).getByText(long);
    expect(current.className).toMatch(/\btruncate\b/);
    expect(current.className).toMatch(/\bmin-w-0\b/);
    expect(current.getAttribute('title')).toBe(long);
    for (const item of nav.querySelectorAll('li:not([aria-hidden])')) {
      expect(item.className).toMatch(/\bmin-w-0\b/);
      expect(item.className).toMatch(/\bmax-w-full\b/);
    }
  });

  it('shows "Step n of N" above the title', () => {
    render(<PageHeader title="Invite your team" step={{ n: 2, of: 4 }} />);
    const step = screen.getByText('Step 2 of 4');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(step.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the actions, and helpKey renders nothing in 15a', () => {
    const { container } = render(<PageHeader title="Prospects" helpKey="prospects" actions={<button type="button">New prospect</button>} />);
    expect(screen.getByRole('button', { name: 'New prospect' })).toBeTruthy();
    expect(container.textContent).not.toContain('prospects');
  });
});
