import { comparePageEntry, enabledRivals } from './compare';
import { GUIDES, GUIDES_PAGE } from './guides';
import { INDUSTRIES, INDUSTRIES_PAGE } from './industries';
import { listedIntegrations } from './integrations';
import { SOURCES } from './sources';

export interface SitePage {
  path: `/${string}`;
  title: string;
  description: string;
  nav?: { label: string; order: number };
  sitemap: boolean;
  changeFrequency?: 'weekly' | 'monthly' | 'yearly';
  priority?: number;
  /** Breadcrumb label; falls back to `nav.label`, then `title`. */
  crumb?: string;
  group?: 'integrations' | 'sources' | 'compare' | 'industries' | 'guides';
  /** Served to visitors but kept out of search (`noindex, follow`); such pages are never in the sitemap. */
  noindex?: boolean;
}

const GROUP_OF = { '/integrations': 'integrations', '/sources': 'sources', '/compare': 'compare', '/for': 'industries', '/guides': 'guides' } as const;

/** A page under a collection base; `/<base>/[slug]` serves it. */
export function collectionPage(
  base: '/integrations' | '/sources' | '/compare' | '/for' | '/guides',
  item: { slug: string; title: string; description: string; crumb: string },
): SitePage {
  return {
    path: `${base}/${item.slug}`,
    title: item.title,
    description: item.description,
    crumb: item.crumb,
    group: GROUP_OF[base],
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
  };
}

/** Each task that creates a page registers its route here (Task 2: '/' only). */
export const PAGES: readonly SitePage[] = [
  {
    path: '/',
    title: 'Rival Monday: white-label competitor monitoring for agencies',
    description:
      'Give your local-service clients a weekly, evidence-backed competitor brief under your own brand. Public information only, no claim without evidence.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 1,
  },
  {
    path: '/how-it-works',
    title: 'How evidence-backed competitor briefs work',
    crumb: 'How it works',
    description: 'How every claim in a brief is captured, written from evidence, verified and linked back to its source.',
    nav: { label: 'How it works', order: 10 },
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/sample-brief',
    title: 'Sample competitor brief for a local business',
    crumb: 'Sample brief',
    description: 'See a full Monday brief for a fictional local business, with every claim linked to the evidence behind it.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/pricing',
    title: 'Pricing for white-label competitor monitoring',
    crumb: 'Pricing',
    description: 'Agency and local-business plans for Rival Monday: what each includes, what it costs, and how to cancel.',
    nav: { label: 'Pricing', order: 40 },
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/partners',
    title: 'Resell competitor monitoring under your brand',
    description: 'Resell Rival Monday under your own brand: you set your client prices and bill through your own Stripe account.',
    sitemap: true,
    changeFrequency: 'monthly',
    nav: { label: 'Partners', order: 50 },
    priority: 0.6,
    crumb: 'Partners',
  },
  {
    path: '/roadmap',
    title: 'Roadmap: acting on recommendations',
    description: 'Planned for version 2.0: draft, approve and publish review replies, Google profile updates and listing fixes, then see the gap to rivals close.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.5,
    nav: { label: 'Roadmap', order: 60 },
    crumb: 'Roadmap',
  },
  {
    path: '/privacy',
    title: 'Privacy',
    description: 'What the waitlist form collects, why, and who helps us run the site.',
    sitemap: true,
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/terms',
    title: 'Terms',
    description: 'Terms for the Rival Monday pilot and this website.',
    sitemap: true,
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/integrations',
    title: 'Integrations and infrastructure',
    description: 'The services Rival Monday runs on, and what each one means for your agency.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    nav: { label: 'Integrations', order: 20 },
    crumb: 'Integrations',
    group: 'integrations',
  },
  // Thin, vendor-intent pages: kept for visitors (linked from /integrations), out of search and the sitemap.
  ...listedIntegrations().map((i) => ({ ...collectionPage('/integrations', { slug: i.slug, ...i.seo }), sitemap: false, noindex: true })),
  {
    path: '/sources',
    title: 'Competitor data sources we monitor',
    description: 'What Rival Monday collects from public information, how often, and what it leaves alone.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    crumb: 'Sources',
    group: 'sources',
  },
  ...SOURCES.map((s) => collectionPage('/sources', { slug: s.slug, ...s.seo })),
  {
    path: '/compare',
    title: 'Compare local competitor monitoring tools',
    description: 'How Rival Monday compares with other kinds of local-competitor tools, and named comparisons where we publish them.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    nav: { label: 'Compare', order: 30 },
    crumb: 'Compare',
    group: 'compare',
  },
  ...enabledRivals().map((r) => collectionPage('/compare', comparePageEntry(r))),
  // Industry and guide pages: found through the footer, sitemap and in-text links, not the top nav.
  {
    path: '/for',
    title: INDUSTRIES_PAGE.seo.title,
    description: INDUSTRIES_PAGE.seo.description,
    crumb: INDUSTRIES_PAGE.seo.crumb,
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.7,
    group: 'industries',
  },
  ...INDUSTRIES.map((i) => ({ ...collectionPage('/for', { slug: i.slug, ...i.seo }), priority: 0.8 })),
  {
    path: '/guides',
    title: GUIDES_PAGE.seo.title,
    description: GUIDES_PAGE.seo.description,
    crumb: GUIDES_PAGE.seo.crumb,
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    group: 'guides',
  },
  ...GUIDES.map((g) => ({ ...collectionPage('/guides', { slug: g.slug, ...g.seo }), priority: 0.7 })),
];

export const NAV_EXTRA: readonly { label: string; href: string; order: number }[] = [];
