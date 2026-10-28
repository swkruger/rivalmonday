'use client';

import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/cn';

/** True inside any `SheetContent`, so an overlay opened there (ResponsivePopover) never nests a second sheet. */
const InSheetContext = React.createContext(false);
function useInSheet() {
  return React.useContext(InSheetContext);
}

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
function SheetContent({ className, children, side = 'left', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-[rgb(11_37_64/0.32)]" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-1 overflow-y-auto bg-surface px-3.5 py-[22px] shadow-dialog outline-none',
          side === 'left' && 'inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line',
          side === 'right' && 'inset-y-0 right-0 w-[280px] max-w-[85vw] border-l border-line',
          side === 'top' && 'inset-x-0 top-0 max-h-[85vh] border-b border-line',
          side === 'bottom' && 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t border-line',
          className,
        )}
        {...props}
      >
        {side === 'bottom' && <span aria-hidden="true" data-slot="sheet-handle" className="mx-auto mb-2 h-1 w-9 shrink-0 rounded-full bg-line" />}
        <InSheetContext.Provider value>{children}</InSheetContext.Provider>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger, useInSheet };
