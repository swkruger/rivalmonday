import { NAV_EXTRA, PAGES } from '../../../content/pages';

/**
 * Server-only module (no `'use client'`): it imports the page registry, which pulls in every rival's
 * comparison content. The layout builds plain `{label, href}` lists here and passes them to the
 * client header, mobile menu and footer, so disabled rivals never reach a client chunk.
 */
export interface NavLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: NavLink[];
}

/** Registered pages with a `nav` entry plus the extra anchors, by order. */
export function navItems(): NavLink[] {
  const fromPages = PAGES.flatMap((p) => (p.nav ? [{ label: p.nav.label, href: p.path as string, order: p.nav.order }] : []));
  return [...fromPages, ...NAV_EXTRA].sort((a, b) => a.order - b.order).map(({ label, href }) => ({ label, href }));
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Sample brief', href: '/sample-brief' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'Sources', href: '/sources' },
      { label: 'Roadmap', href: '/roadmap' },
    ],
  },
  {
    heading: 'Industries',
    links: [
      { label: 'HVAC', href: '/for/hvac' },
      { label: 'Plumbing', href: '/for/plumbing' },
      { label: 'Dental', href: '/for/dental' },
    ],
  },
  {
    heading: 'Guides',
    links: [
      { label: 'Local competitor analysis', href: '/guides/local-competitor-analysis' },
      { label: 'Map rank grids', href: '/guides/map-rank-grid' },
      { label: 'Monitoring checklist', href: '/guides/competitor-monitoring-checklist' },
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

/** Footer columns: registered links only, plus one link per enabled rival under Compare; empty columns dropped. */
export function footerColumns(): FooterColumn[] {
  const registered = new Set<string>(PAGES.map((p) => p.path));
  const rivals = PAGES.filter((p) => p.group === 'compare' && p.path !== '/compare').map((p) => ({ label: p.crumb ?? p.title, href: p.path as string }));
  return COLUMNS.map((c) => (c.heading === 'Compare' ? { ...c, links: [...c.links, ...rivals] } : c))
    .map((c) => ({ ...c, links: c.links.filter((l) => registered.has(l.href)) }))
    .filter((c) => c.links.length > 0);
}
