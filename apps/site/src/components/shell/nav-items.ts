import { ANY_INDUSTRY, INDUSTRIES } from '../../../content/industries';
import { NAV_EXTRA, PAGES } from '../../../content/pages';

/**
 * Server-only module (no `'use client'`): it imports the page registry, which pulls in every rival's
 * comparison content. The layout builds plain `{label, href}` lists here and passes them to the
 * client header, mobile menu and footer, so disabled rivals never reach a client chunk.
 */
export interface NavLink {
  label: string;
  href: string;
  /** Footer only: set apart at the end of a two-column list. */
  highlight?: boolean;
  /** Footer only: the link is hidden on the other side's pages. */
  side?: 'agency' | 'business';
  /** Footer only: label on `/` and both-reader pages, where the two pricing links must be told apart. */
  wideLabel?: string;
}

export interface FooterColumn {
  heading: string;
  links: NavLink[];
  /** A long list: the footer lays its links out in two columns. */
  twoColumn?: boolean;
}

/** Menu per side: registered pages with a `nav` entry (default side `agency`) plus the extras, by order. */
export function navMenus(): { agency: NavLink[]; business: NavLink[] } {
  const fromPages = PAGES.flatMap((p) => (p.nav ? [{ label: p.nav.label, href: p.path as string, order: p.nav.order, side: p.nav.side ?? 'agency' }] : []));
  const all = [...fromPages, ...NAV_EXTRA].sort((a, b) => a.order - b.order);
  const menu = (side: 'agency' | 'business') => all.filter((n) => n.side === side).map(({ label, href }) => ({ label, href }));
  return { agency: menu('agency'), business: menu('business') };
}

/** Registered paths that belong to one side, for `sideOf` (disabled rivals are not in `PAGES`). */
export function sidePaths(): { agency: string[]; business: string[] } {
  return {
    agency: PAGES.filter((p) => p.side === 'agency').map((p) => p.path as string),
    business: PAGES.filter((p) => p.side === 'business').map((p) => p.path as string),
  };
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Sample brief', href: '/sample-brief' },
      { label: 'Pricing', wideLabel: 'Pricing for agencies', href: '/agencies/pricing' },
      { label: 'Pricing', wideLabel: 'Pricing for local businesses', href: '/business/pricing' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'Sources', href: '/sources' },
      { label: 'Roadmap', href: '/roadmap' },
    ],
  },
  {
    heading: 'Industries',
    twoColumn: true,
    links: [...INDUSTRIES.map((i) => ({ label: i.name, href: `/for/${i.slug}` })), { label: ANY_INDUSTRY.heading, href: '/for', highlight: true }],
  },
  {
    heading: 'Guides',
    links: [
      { label: 'Local competitor analysis', href: '/guides/local-competitor-analysis' },
      { label: 'Map rank grids', href: '/guides/map-rank-grid' },
      { label: 'Monitoring checklist', href: '/guides/competitor-monitoring-checklist' },
      { label: 'Reading rivals’ reviews', href: '/guides/read-competitor-reviews' },
      { label: 'Reading rivals’ ads', href: '/guides/read-competitor-ads' },
      { label: 'Writing a competitor brief', href: '/guides/write-competitor-brief' },
      { label: 'All guides', href: '/guides' },
    ],
  },
  { heading: 'Compare', links: [{ label: 'Compare overview', href: '/compare' }] },
  { heading: 'Company', links: [{ label: 'Partners', href: '/partners' }] },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

/** Footer columns: registered links only, each carrying its page's side; plus one link per enabled rival under Compare; empty columns dropped. */
export function footerColumns(): FooterColumn[] {
  const sideOfPath = new Map<string, 'agency' | 'business' | undefined>(PAGES.map((p) => [p.path, p.side]));
  const rivals = PAGES.filter((p) => p.group === 'compare' && p.path !== '/compare').map((p) => ({ label: p.crumb ?? p.title, href: p.path as string }));
  return COLUMNS.map((c) => (c.heading === 'Compare' ? { ...c, links: [...c.links, ...rivals] } : c))
    .map((c) => ({
      ...c,
      links: c.links.filter((l) => sideOfPath.has(l.href)).map((l) => {
        const side = sideOfPath.get(l.href);
        return side ? { ...l, side } : l;
      }),
    }))
    .filter((c) => c.links.length > 0);
}
