'use client';

import { Dialog as SheetPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/cn';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('font-semibold text-ink', className)} {...props} />;
}

/** A side drawer on radix Dialog: focus is trapped while open and returns to the trigger on close; Escape and the backdrop close it. */
function SheetContent({ className, children, side = 'left', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'left' | 'right' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-[280px] max-w-[85vw] flex-col gap-1 overflow-y-auto bg-surface px-3.5 py-[22px] shadow-lg outline-none',
          side === 'left' ? 'left-0 border-r border-line' : 'right-0 border-l border-line',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger };
