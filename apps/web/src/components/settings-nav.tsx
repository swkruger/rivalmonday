'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeHref, type NavItem, type NavSection } from './shell/nav-items';

function TabLink({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
        current ? 'bg-primary-soft font-semibold text-primary-soft-text' : 'font-medium text-ink/70 hover:bg-muted-surface hover:text-ink'
      }`}
    >
      {item.label}
    </Link>
  );
}

/**
 * Phase 15a §2.5: a settings area's sub-nav (`settingsNavFor`). One `<nav>`: a grouped left column from `md` up, a
 * single row of horizontally scrolling tabs below it (group headings hidden). Client component so the active tab tracks
 * the live URL — the settings layout is not re-rendered on client-side navigation. Visibility is cosmetic; each page
 * keeps its own guard (refusals 404).
 */
export function SettingsNav({ sections }: { sections: NavSection[] }) {
  // The bare index (`/agency/settings`, `/c/<id>/settings`) only redirects to the first tab: select it meanwhile.
  const current = activeHref(sections, usePathname() ?? '') ?? sections[0]?.items[0]?.href ?? null;
  return (
    <nav aria-label="Settings" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:mx-0 md:w-52 md:shrink-0 md:flex-col md:gap-5 md:overflow-visible md:border-b-0 md:px-0 md:pb-0">
      {sections.map((s) => {
        const links = s.items.map((item) => <TabLink key={item.href} item={item} current={item.href === current} />);
        const className = 'flex shrink-0 gap-1 md:flex-col md:gap-0.5';
        return s.label ? (
          <div key={s.id} role="group" aria-label={s.label} className={className}>
            <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-ink md:block">{s.label}</div>
            {links}
          </div>
        ) : (
          <div key={s.id} className={className}>{links}</div>
        );
      })}
    </nav>
  );
}
