import { NAV_EXTRA, PAGES } from '../../../content/pages';

export interface NavItem {
  label: string;
  href: string;
  order: number;
}

/** Registered pages with a `nav` entry plus the extra anchors, by order. */
export function navItems(): NavItem[] {
  const fromPages = PAGES.flatMap((p) => (p.nav ? [{ label: p.nav.label, href: p.path as string, order: p.nav.order }] : []));
  return [...fromPages, ...NAV_EXTRA].sort((a, b) => a.order - b.order);
}
