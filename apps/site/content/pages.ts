export interface SitePage {
  path: `/${string}`;
  title: string;
  description: string;
  nav?: { label: string; order: number };
  sitemap: boolean;
  changeFrequency?: 'weekly' | 'monthly' | 'yearly';
  priority?: number;
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
];

export const NAV_EXTRA: readonly { label: string; href: string; order: number }[] = [
  { label: 'Pricing', href: '/#pricing', order: 40 },
];
