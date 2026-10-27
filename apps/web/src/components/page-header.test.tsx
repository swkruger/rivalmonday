// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FridayDock } from './ask/friday-dock';
import { PageHeader } from './page-header';
import { countPrimaryActions } from './page-header-guard';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/agency' }));

afterEach(cleanup);

describe('PageHeader (15a §2.7)', () => {
  it('renders exactly one h1 with the title, and the description', () => {
    render(<PageHeader title="Approvals" description="Briefs waiting for you." />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('Approvals');
    expect(h1s[0]!.getAttribute('data-slot')).toBe('page-title');
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

  it('gives every truncating crumb (link, plain middle, current) its full label as a title', () => {
    render(<PageHeader title="Acme" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Customers' }, { label: 'Acme' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Platform' }).getAttribute('title')).toBe('Platform');
    expect(within(nav).getByText('Customers').getAttribute('title')).toBe('Customers');
    expect(within(nav).getByText('Acme').getAttribute('title')).toBe('Acme');
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

describe('PageHeader v1 (16b)', () => {
  it('renders meta under the description', () => {
    render(<PageHeader title="Overview" description="Where you stand." meta={<span>Updated 2 hours ago</span>} />);
    const d = screen.getByText('Where you stand.');
    const m = screen.getByText('Updated 2 hours ago');
    expect(d.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('standard: tabs render after the title row; compact: inside it', () => {
    const { container, rerender } = render(<PageHeader title="Acme" actions={<button type="button">Act</button>} tabs={<nav aria-label="Tabs">t</nav>} />);
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    const act = screen.getByRole('button', { name: 'Act' });
    expect(act.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-slot="page-header-row"]')!.contains(tabs)).toBe(false);
    rerender(<PageHeader title="Acme" variant="compact" actions={<button type="button">Act</button>} tabs={<nav aria-label="Tabs">t</nav>} />);
    const tabs2 = screen.getByRole('navigation', { name: 'Tabs' });
    expect(container.querySelector('[data-slot="page-header-row"]')!.contains(tabs2)).toBe(true);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.compareDocumentPosition(tabs2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('data-variant reflects the prop (default standard)', () => {
    const { container, rerender } = render(<PageHeader title="A" />);
    expect(container.querySelector('[data-slot="page-header"]')!.getAttribute('data-variant')).toBe('standard');
    rerender(<PageHeader title="A" variant="compact" />);
    expect(container.querySelector('[data-slot="page-header"]')!.getAttribute('data-variant')).toBe('compact');
  });

  it('390 guard: a 120-char unbroken title stays one h1 that can wrap (break-words); four crumbs keep separators', () => {
    const long = 'x'.repeat(120);
    render(<PageHeader title={long} breadcrumb={[{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C', href: '/c' }, { label: 'D' }]} />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.className).toContain('break-words');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const seps = [...nav.querySelectorAll('[aria-hidden="true"]')];
    expect(seps).toHaveLength(3);
    for (const sep of seps) expect(sep.textContent).toBe('›');
    expect(within(nav).getByText('D').getAttribute('aria-current')).toBe('page');
  });
});

describe('countPrimaryActions', () => {
  it('counts default-variant buttons and links inside the page header', () => {
    const { container } = render(
      <PageHeader title="A" actions={<><button type="button" data-variant="default">Go</button><a href="/x" data-variant="default">Link</a><button type="button" data-variant="outline">No</button></>} />,
    );
    expect(countPrimaryActions(container)).toBe(2);
  });
});

describe('PageHeader Guide button (15b-1)', () => {
  it('shows Guide before the actions only with a helpKey and a guide', async () => {
    render(<PageHeader title="Overview" helpKey="page:overview" guide actions={<button type="button">Act</button>} />);
    const guide = await screen.findByRole('button', { name: /guide/i });
    const act = screen.getByRole('button', { name: 'Act' });
    expect(guide.compareDocumentPosition(act) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no button without a guide, without a key, or with neither', () => {
    const { rerender } = render(<PageHeader title="Overview" helpKey="page:overview" actions={<button type="button">Act</button>} />);
    expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
    rerender(<PageHeader title="Overview" guide actions={<button type="button">Act</button>} />);
    expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
    rerender(<PageHeader title="Overview" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PageHeader detail (16c P7)', () => {
  it('detail: renders the avatar before the h1 and data-variant="detail"', () => {
    const { container } = render(<PageHeader title="Smith HVAC" variant="detail" avatar={<span data-testid="av">SH</span>} />);
    expect(container.querySelector('[data-slot="page-header"]')!.getAttribute('data-variant')).toBe('detail');
    const av = screen.getByTestId('av');
    const h1 = screen.getByRole('heading', { level: 1, name: 'Smith HVAC' });
    expect(av.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ignores avatar for standard', () => {
    render(<PageHeader title="Smith HVAC" avatar={<span data-testid="av">SH</span>} />);
    expect(screen.queryByTestId('av')).toBeNull();
  });
});

describe('PageHeader Friday trigger (16d P6)', () => {
  const config = { clientId: 'c1', assistantName: 'Friday', productName: null, reviewAllowed: false, starters: [], scopeLabel: 'Acme', saveAction: vi.fn(), refsAction: vi.fn() };

  it('renders the trigger inside the header, before the page actions, without counting as a primary action', () => {
    const { container } = render(
      <FridayDock config={config}>
        <PageHeader title="Overview" actions={<button type="button" data-variant="default">Share</button>} />
      </FridayDock>,
    );
    const trigger = screen.getByRole('button', { name: 'Ask Friday' });
    expect(container.querySelector('[data-slot="page-header"]')!.contains(trigger)).toBe(true);
    expect(trigger.getAttribute('data-slot')).toBe('friday-trigger');
    const share = screen.getByRole('button', { name: 'Share' });
    expect(trigger.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(countPrimaryActions(container)).toBe(1);
  });

  it('renders the trigger even on a page with no actions, and nothing outside a dock', () => {
    const { container, rerender } = render(<FridayDock config={config}><PageHeader title="Overview" /></FridayDock>);
    expect(screen.getByRole('button', { name: 'Ask Friday' })).toBeTruthy();
    rerender(<PageHeader title="Overview" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[data-slot="page-header-row"]')!.children).toHaveLength(1);
  });
});
