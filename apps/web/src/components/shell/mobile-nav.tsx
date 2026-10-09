'use client';

import { Sheet, SheetContent, SheetTitle, SheetTrigger, Wordmark } from '@cs/ui';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import type { NavRoleFlags } from './nav-items';
import { type NavClient, SidebarNav } from './sidebar-nav';

/**
 * Decision 14: below `lg` the sidebar is hidden and this menu button opens the same `SidebarNav` in a drawer.
 * Any link tap closes it (including a tap on the current page, where the pathname doesn't change).
 * Plain props only — no `@cs/email` import in a client file (HANDOVER §6).
 */
export function MobileNav({ displayName, logoUrl, whiteLabel, flags, clients }: {
  displayName: string;
  logoUrl: string | null;
  whiteLabel: boolean;
  flags: NavRoleFlags;
  clients: NavClient[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Open menu" className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-lg text-ink hover:bg-muted-surface lg:hidden">
        <Menu aria-hidden className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="px-2.5 pb-[18px]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={displayName} className="h-8 w-auto" />
          ) : (
            <Wordmark name={whiteLabel ? displayName : undefined} />
          )}
        </div>
        <SidebarNav flags={flags} clients={clients} />
      </SheetContent>
    </Sheet>
  );
}
