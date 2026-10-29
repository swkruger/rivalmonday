import { comparePageEntry, enabledRivals } from './compare';
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
  group?: 'integrations' | 'sources' | 'compare';
}

/** A page under a collection base; `/<base>/[slug]` serves it. */
export function collectionPage(
  base: '/integrations' | '/sources' | '/compare',
  item: { slug: string; title: string; description: string; crumb: string },
): SitePage {
  return {
    path: `${base}/${item.slug}`,
    title: item.title,
    description: item.description,
    crumb: item.crumb,
    group: base.slice(1) as NonNullable<SitePage['group']>,
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
  };
}

/** Each task that creates a page registers its route here (Task 2: '/' only). */
export const PAGES: readonly SitePage[] = [
  {
    path: '/',
    title: 'Rival Monday — White-label competitor intelligence',
    description:
      'Give your local-service clients a weekly, evidence-backed competitor brief under your own brand. Public information only, no claim without evidence.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 1,
  },
  {
    path: '/how-it-works',
    title: 'How it works',
    description: 'How every claim in a brief is captured, written from evidence, verified and linked back to its source.',
    nav: { label: 'How it works', order: 10 },
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/sample-brief',
    title: 'Sample Monday brief',
    description: 'See a full Monday brief for a fictional local business, with every claim linked to the evidence behind it.',
    nav: { label: 'Sample brief', order: 20 },
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/pricing',
    title: 'Pricing',
    description: 'Agency and local-business plans for Rival Monday: what each includes, what it costs, and how to cancel.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.8,
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
    title: 'Integrations',
    description: 'The services Rival Monday runs on, and what each one means for your agency.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    crumb: 'Integrations',
    group: 'integrations',
  },
  ...listedIntegrations().map((i) => collectionPage('/integrations', { slug: i.slug, ...i.seo })),
  {
    path: '/sources',
    title: 'Sources',
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
    title: 'Compare',
    description: 'How Rival Monday compares with other kinds of local-competitor tools, and named comparisons where we publish them.',
    sitemap: true,
    changeFrequency: 'monthly',
    priority: 0.6,
    crumb: 'Compare',
    group: 'compare',
  },
  ...enabledRivals().map((r) => collectionPage('/compare', comparePageEntry(r))),
];

export const NAV_EXTRA: readonly { label: string; href: string; order: number }[] = [
  { label: 'Pricing', href: '/#pricing', order: 40 },
];
