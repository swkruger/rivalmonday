'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { currentSettingsHref, type NavItem, type NavSection } from './shell/nav-items';

const CHIP_CLASS = 'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-line px-3 text-13 font-medium text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function ChipLink({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={current ? `${CHIP_CLASS} border-transparent bg-primary-soft text-primary-soft-text` : `${CHIP_CLASS} hover:bg-muted-surface`}
    >
      {item.label}
    </Link>
  );
}

/**
 * Phase 15a §2.5 / 16b (P3): a settings area's tabs (`settingsNavFor`) inside the page, below `lg` only — one
 * horizontally scrolling row of chips, no group headings (09 § 5.1). From `lg` up the sidebar's drill-in
 * (`SettingsDrillIn`) shows the same tabs; both are `aria-label="Settings"` and exactly one is visible at any width.
 * Client component so the active tab tracks the live URL — the settings layout is not re-rendered on client-side
 * navigation. Visibility is cosmetic; each page keeps its own guard (refusals 404).
 */
export function SettingsNav({ sections }: { sections: NavSection[] }) {
  const current = currentSettingsHref(sections, usePathname() ?? '');
  const ref = useRef<HTMLElement>(null);
  // The row scrolls sideways on a phone: bring the active chip into view (the row only, never the page).
  useEffect(() => {
    const row = ref.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !chip) return;
    row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
  }, [current]);
  return (
    <nav ref={ref} aria-label="Settings" className="relative -mx-4 flex gap-2 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] lg:hidden">
      {sections.flatMap((s) => s.items).map((item) => <ChipLink key={item.href} item={item} current={item.href === current} />)}
    </nav>
  );
}
