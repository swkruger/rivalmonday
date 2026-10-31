'use client';

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShellBrand } from './shell-brand';
import { ContextSwitcher, type SwitcherProps } from './context-switcher';
import type { NavCounts, NavRoleFlags } from './nav-items';
import { type NavClient, type NavFallback, SidebarNav } from './sidebar-nav';

/**
 * Decision 14 / spec §2.11 (D8): below `lg` the sidebar is hidden and this menu button opens the context switcher and
 * the same `SidebarNav` in a drawer. Any link tap closes it (including a tap on the current page, where the pathname
 * doesn't change); so do a route change (a switcher pick navigates with the router, not a link) and the viewport
 * growing to `lg` (BACKLOG 5c-2 T18), where the drawer has no trigger any more.
 * Plain props only — no `@cs/email` import in a client file (HANDOVER §6). In the platform zone `AppShell` passes the
 * Rival Monday name and no logo. `clients` (the viewer's own clients) validates a remembered client.
 */
export function MobileNav({ displayName, logoUrl, whiteLabel, flags, counts, zone, fallback, clients, switcher }: {
  displayName: string;
  logoUrl: string | null;
  whiteLabel: boolean;
  flags: NavRoleFlags;
  counts: NavCounts;
  zone?: 'platform';
  fallback: NavFallback | null;
  clients: NavClient[];
  switcher: SwitcherProps;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: { matches: boolean }) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Open menu" className="grid size-8 flex-shrink-0 place-items-center rounded-sm text-ink hover:bg-muted-surface lg:hidden">
        <Menu aria-hidden className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <ShellBrand displayName={displayName} logoUrl={logoUrl} whiteLabel={whiteLabel} />
        <div className="pb-4">
          <ContextSwitcher {...switcher} modal />
        </div>
        <SidebarNav flags={flags} counts={counts} zone={zone} fallback={fallback} clients={clients} backNames={{ agency: switcher.agencyName, clients: switcher.clients }} />
      </SheetContent>
    </Sheet>
  );
}
