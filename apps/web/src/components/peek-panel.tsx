'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface PeekNav {
  prevHref: string | null;
  nextHref: string | null;
  /** Only when the URL names the item (?event=); null hides Close and disables Esc. */
  closeHref: string | null;
  /** data-row-id of the open row; Esc returns focus to it. */
  rowId: string | null;
  labels: { prev: string; next: string; close: string };
}

const BUTTON = 'inline-flex size-8 items-center justify-center rounded-sm';
const ACTIVE = `${BUTTON} text-muted-ink hover:bg-muted-surface hover:text-ink focus-visible:outline-2 outline-offset-2 outline-ring`;
const DISABLED = `${BUTTON} text-muted-ink opacity-40`;

function NavLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) {
    return (
      <span aria-disabled="true" aria-label={label} className={DISABLED}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-label={label} className={ACTIVE}>
      {children}
    </Link>
  );
}

/**
 * Peek panel (D11, D-21, 16c P3): the lg detail column of a list + detail page with a header row (label, previous /
 * next within the current page of results, close). Esc inside the panel closes it — only when the URL names the item —
 * and returns focus to the open row (`[data-row-id]`).
 */
export function PeekPanel({ label, nav, children }: { label: string; nav: PeekNav; children: React.ReactNode }) {
  const router = useRouter();
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || !nav.closeHref) return;
    e.preventDefault();
    if (nav.rowId) {
      const row = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(nav.rowId)}"]`);
      row?.focus();
    }
    router.push(nav.closeHref, { scroll: false });
  };
  return (
    <section aria-label={label} data-slot="peek-panel" className="min-w-0 lg:border-l lg:border-line lg:pl-6" onKeyDown={onKeyDown}>
      <div className="mb-4 flex h-8 items-center gap-1 text-13 font-medium text-muted-ink">
        <span className="mr-auto">{label}</span>
        <NavLink href={nav.prevHref} label={nav.labels.prev}>
          <ChevronUp className="size-4" aria-hidden="true" />
        </NavLink>
        <NavLink href={nav.nextHref} label={nav.labels.next}>
          <ChevronDown className="size-4" aria-hidden="true" />
        </NavLink>
        {nav.closeHref ? (
          <Link href={nav.closeHref} scroll={false} aria-label={nav.labels.close} className={ACTIVE}>
            <X className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
