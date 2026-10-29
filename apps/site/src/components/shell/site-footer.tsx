'use client';

import { Wordmark } from '@cs/ui';
import { PAGES } from '../../../content/pages';
import { JoinButton } from '../join/join-button';
import { usePilot } from './pilot-context';
import { SocialLinks } from './social-links';

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Sample brief', href: '/sample-brief' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'Sources', href: '/sources' },
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

export function SiteFooter() {
  const { pilotMode } = usePilot();
  const registered = new Set<string>(PAGES.map((p) => p.path));
  const rivals = PAGES.filter((p) => p.group === 'compare' && p.path !== '/compare').map((p) => ({ label: p.crumb ?? p.title, href: p.path as string }));
  const columns = COLUMNS.map((c) => (c.heading === 'Compare' ? { ...c, links: [...c.links, ...rivals] } : c)).map((c) => ({ ...c, links: c.links.filter((l) => registered.has(l.href)) })).filter((c) => c.links.length > 0);

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="site-container py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="flex flex-col gap-3">
            <Wordmark />
            <SocialLinks />
          </div>
          {columns.length > 0 && (
            <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-6 md:gap-x-12">
              {columns.map((c) => (
                <div key={c.heading}>
                  <h3 className="mb-2 text-13 font-semibold text-ink">{c.heading}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {c.links.map((l) => (
                      <li key={l.href}>
                        <a href={l.href} className="text-sm text-ink-secondary hover:text-ink hover:underline">
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-line pt-4 text-13 text-muted-ink sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Rival Monday</p>
          {!pilotMode && (
            <JoinButton start="business" variant="ghost">
              Own a local business? Join the waitlist
            </JoinButton>
          )}
        </div>
      </div>
    </footer>
  );
}
