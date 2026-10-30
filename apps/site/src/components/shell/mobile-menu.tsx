'use client';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { siteEnv } from '../../lib/env';
import { JoinButton } from '../join/join-button';
import type { NavLink } from './nav-items';

/** Phone/tablet menu (≤ 1023 px): a right-hand sheet with focus trap, Esc and backdrop close. */
export function MobileMenu({ items }: { items: NavLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Menu" aria-expanded={open}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetTitle className="px-2 pb-2">Menu</SheetTitle>
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
          <JoinButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
