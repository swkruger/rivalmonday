'use client';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BUSINESS } from '../../../content/business';
import { siteEnv } from '../../lib/env';
import { JoinButton } from '../join/join-button';
import { AudienceSwitch } from './audience-switch';
import type { NavLink } from './nav-items';
import { useSide } from './side-context';

/** Menu sheet for the widths where the header drops its inline menu. Only the agency and business sides have one; it closes when the address changes. */
export function MobileMenu({ menus }: { menus: { agency: NavLink[]; business: NavLink[] } }) {
  const side = useSide();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // A new address closes the sheet (state adjusted during render, no effect or timer).
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  if (side !== 'agency' && side !== 'business') return null;

  const items = menus[side];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 xl:hidden" aria-label="Menu" aria-expanded={open}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetTitle className="px-2 pb-2">Menu</SheetTitle>
        <AudienceSwitch className="px-1 pb-2" />
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {items.map((item) => (
            <SheetClose key={item.href} asChild>
              <a href={item.href} className="rounded-sm px-2 py-2 text-sm font-medium text-ink hover:bg-muted-surface">
                {item.label}
              </a>
            </SheetClose>
          ))}
        </nav>
        {/* Any control inside (Sign in, Join) closes the sheet so no second modal layer stacks on it. */}
        <div className="mt-3 flex flex-col items-stretch gap-2 px-2" onClick={() => setOpen(false)}>
          <Button asChild variant="outline">
            <a href={`${siteEnv.appUrl}/sign-in`}>Sign in</a>
          </Button>
          {side === 'business' ? <JoinButton start="business">{BUSINESS.hero.primaryCta}</JoinButton> : <JoinButton />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
