'use client';

import { Wordmark } from '@cs/ui';
import { JoinButton } from '../join/join-button';
import { usePilot } from './pilot-context';
import type { FooterColumn } from './nav-items';
import { SocialLinks } from './social-links';

/** `columns` come from the server (`footerColumns()` in `nav-items.ts`): this client module never imports the page registry. */
export function SiteFooter({ columns }: { columns: FooterColumn[] }) {
  const { pilotMode } = usePilot();

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
