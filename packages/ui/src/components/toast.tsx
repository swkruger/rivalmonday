'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import * as React from 'react';

interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = React.createContext<{ show(opts: ToastOptions): void } | null>(null);

const DURATION_MS = 4000;
const DURATION_WITH_ACTION_MS = 6000;

/**
 * Bottom-right toasts on radix Toast (09 § 4.6): ink pill, 4 s (6 s with an action such as Undo). Radix announces
 * each toast through its own visually hidden live region; `type="background"` makes that `role="status"` +
 * `aria-live="polite"` (09's `role=status`), so the root carries no role. The viewport keeps radix's default
 * accessible name "Notifications (F8)" (owner sign-off list).
 */
function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);
  const api = React.useMemo(
    () => ({
      show(opts: ToastOptions) {
        const id = nextId.current++;
        setItems((prev) => [...prev, { ...opts, id }]);
      },
    }),
    [],
  );
  const remove = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            data-slot="toast"
            type="background"
            duration={t.action ? DURATION_WITH_ACTION_MS : DURATION_MS}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
            className="flex items-center gap-3 rounded-md bg-ink px-4 py-2 text-13 text-white shadow-overlay data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <ToastPrimitive.Description className="min-w-0 flex-1">{t.message}</ToastPrimitive.Description>
            {t.action ? (
              <ToastPrimitive.Action altText={t.action.label} asChild>
                <button
                  type="button"
                  onClick={t.action.onClick}
                  className="rounded-xs text-13 font-semibold text-white underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t.action.label}
                </button>
              </ToastPrimitive.Action>
            ) : null}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className="fixed right-4 bottom-4 z-[100] m-0 flex w-96 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function useToast(): { show(opts: ToastOptions): void } {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export { ToastProvider, useToast };
