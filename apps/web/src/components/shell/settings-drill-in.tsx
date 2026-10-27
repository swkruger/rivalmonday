'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { NavSection } from './nav-items';
import { NAV_ITEM_FOCUS_CLASS, NavLink, SectionLabel } from './nav-link';

/**
 * 16b (D11, Frame 3, P3): on a settings route the sidebar column swaps its menu for this drill-in — "‹ Back to {name}"
 * and the same `settingsNavFor` tabs the in-page chip row shows below `lg`. Same item grammar as the main menu
 * (`NavLink`); only labelled sections are named groups. `aria-label="Settings"` matches the chip row: exactly one of
 * the two is visible at any width (sidebar `lg:flex`, chip row `lg:hidden`).
 */
export function SettingsDrillIn({ sections, current, back }: { sections: NavSection[]; current: string | null; back: { href: string; label: string } }) {
  return (
    <nav aria-label="Settings" className="flex flex-1 flex-col gap-5">
      <Link href={back.href} className={`flex h-8 items-center gap-1.5 rounded-sm px-2 text-13 font-medium text-muted-ink hover:bg-muted-surface ${NAV_ITEM_FOCUS_CLASS}`}>
        <ChevronLeft aria-hidden className="size-4 flex-shrink-0" strokeWidth={1.75} />
        <span className="truncate">{back.label}</span>
      </Link>
      {sections.map((s) => {
        const links = s.items.map((item) => <NavLink key={item.href} item={item} current={item.href === current} />);
        return s.label ? (
          <div key={s.id} role="group" aria-label={s.label} className="flex flex-col gap-0.5">
            <SectionLabel>{s.label}</SectionLabel>
            {links}
          </div>
        ) : (
          <div key={s.id} className="flex flex-col gap-0.5">{links}</div>
        );
      })}
    </nav>
  );
}
