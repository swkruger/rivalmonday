'use client';

import { Sheet, SheetContent, SheetTitle } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const [isLg, setIsLg] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setIsLg(true);
      return;
    }
    const mq = window.matchMedia(LG_QUERY);
    setIsLg(mq.matches);
    const onChange = (e: { matches: boolean }) => setIsLg(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return (
    <Sheet open={isLg === false && open} onOpenChange={(o) => { if (!o) router.push(closeHref); }}>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetTitle className="px-1 pb-3 text-base font-semibold text-ink">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
