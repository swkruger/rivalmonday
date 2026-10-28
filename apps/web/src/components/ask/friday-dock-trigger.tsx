'use client';
import { useMediaQuery } from '@cs/ui';
import Link from 'next/link';
import { useFridayDock } from './friday-dock-context';

/**
 * 16d P6: "Ask {assistant}" in `PageHeader`'s actions, before the page's own. Friday's amber pill look at `h-8` — a plain
 * `button`, not a `Button`, so it never counts as the header's primary action (`countPrimaryActions`). Renders nothing
 * outside a dock (agency pages, guests, support, no `ask`), on the Ask pages, and while the column is open at ≥ 1280.
 */
export function FridayDockTrigger() {
  const dock = useFridayDock();
  // null (SSR, first paint) renders the button, like ≥ 768, so server and client markup agree.
  const tabletUp = useMediaQuery('(min-width: 768px)');
  if (!dock || !dock.available || (dock.open && dock.wide)) return null;
  const pill =
    'inline-flex h-8 shrink-0 items-center self-start rounded-full bg-amber px-3 text-sm font-semibold text-amber-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:self-auto';
  // 16f P3: below 768 the trigger goes to the full Ask page instead of opening a sheet.
  if (tabletUp === false) {
    return (
      <Link href={`/c/${dock.clientId}/ask`} data-slot="friday-trigger" className={pill}>
        Ask {dock.assistantName}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-slot="friday-trigger"
      aria-expanded={dock.open}
      aria-controls={dock.panelId}
      onClick={() => dock.setOpen(!dock.open)}
      className={pill}
    >
      Ask {dock.assistantName}
    </button>
  );
}
