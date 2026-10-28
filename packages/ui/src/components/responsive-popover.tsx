'use client';

import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';
import { useMediaQuery } from '../hooks/use-media-query';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { X } from 'lucide-react';
import { Button } from './button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger, useInSheet } from './sheet';

export const RESPONSIVE_POPOVER_QUERY = '(min-width: 768px)';

/**
 * A popover at >= 768 px and a bottom sheet below. `null` (matchMedia not run yet) renders the popover branch, which is
 * what the server renders. Crossing 768 while open closes it, so the two overlays never swap under the user.
 */
export function ResponsivePopover({ open, onOpenChange, trigger, title, children, align, contentClassName, popoverContentProps }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  /** Visible `SheetTitle` below 768 (the dialog's accessible name). */
  title: string;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Popover branch only. */
  contentClassName?: string;
  /** Popover branch only (hover handlers, focus control). */
  popoverContentProps?: Omit<ComponentProps<typeof PopoverContent>, 'children' | 'className' | 'align'>;
}) {
  const inSheet = useInSheet();
  const wide = useMediaQuery(RESPONSIVE_POPOVER_QUERY);
  const prev = useRef(wide);
  useEffect(() => {
    if (prev.current !== null && wide !== null && prev.current !== wide && open) onOpenChange(false);
    prev.current = wide;
  }, [wide, open, onOpenChange]);

  // Inside a sheet (e.g. the Changes detail on phones) a second bottom sheet would nest; use the popover there.
  if (wide === false && !inSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-base">{title}</SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close"><X aria-hidden="true" /></Button>
            </SheetClose>
          </div>
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className={contentClassName} {...popoverContentProps}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
