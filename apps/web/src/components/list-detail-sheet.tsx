'use client';

import { Sheet, SheetContent, SheetTitle, useMediaQuery } from '@cs/ui';
import { useRouter } from 'next/navigation';

export const LG_QUERY = '(min-width: 1024px)';

/**
 * Phone detail sheet (15c-2b D15/P13). Closed until matchMedia has run (`isLg === null`), so server and first client
 * render agree; open only below `lg` and only when the URL names an item. Every close path (Esc, backdrop, close
 * button) navigates to `closeHref`.
 */
export function ListDetailSheet({ open, closeHref, title, children }: {
  open: boolean;
  closeHref: string;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isLg = useMediaQuery(LG_QUERY); // null until matchMedia ran (or when it is missing): closed
  return (
    <Sheet open={isLg === false && open} onOpenChange={(o) => { if (!o) router.push(closeHref); }}>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetTitle className="px-1 pb-3 text-base font-semibold text-ink">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
