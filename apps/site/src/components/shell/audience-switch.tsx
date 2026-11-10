'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SWITCH } from '../../../content/chooser';
import { switchHref } from '../../lib/side';
import { useSide } from './side-context';

const LINK = 'inline-flex min-h-9 items-center rounded-sm px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Two links, one per side: the current side is marked with weight and an underline, never colour. On a both-reader page neither is current.
 * They are the site's only `next/link` links besides the 404 page: a side change keeps the page loaded, so header, menu and join popup follow the new address.
 */
export function AudienceSwitch({ className }: { className?: string }) {
  const side = useSide();
  const pathname = usePathname();

  return (
    <nav aria-label={SWITCH.label} className={className}>
      <ul className="flex items-center gap-1">
        {(['agency', 'business'] as const).map((to) => {
          const current = side === to;
          return (
            <li key={to}>
              <Link
                href={switchHref(pathname, to)}
                aria-current={current ? 'page' : undefined}
                className={`${LINK} ${current ? 'font-semibold text-ink underline decoration-2 underline-offset-8' : 'font-medium text-ink-secondary hover:bg-muted-surface hover:text-ink'}`}
              >
                {SWITCH[to]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
