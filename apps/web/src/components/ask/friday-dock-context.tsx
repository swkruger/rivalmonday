'use client';
import { createContext, useContext, useEffect, useState } from 'react';

/** P6: the docked column needs the room of the 1560 px sheet plus a 400 px panel; below it the panel is a right sheet. */
export const DOCK_WIDE_QUERY = '(min-width: 1280px)';
/** The Ask pages have their own conversation: no trigger there, and an open panel closes (and stays closed). */
export const ASK_PATH = /^\/c\/[^/]+\/ask(?:\/|$)/;

export interface FridayDockValue {
  /** False on `/c/<id>/ask*`. */
  available: boolean;
  open: boolean;
  setOpen(v: boolean): void;
  assistantName: string;
  /** The client the dock belongs to: the phone trigger links to its Ask page. */
  clientId: string;
  /** True at ≥ 1280 px (the column); false before hydration and below it (the sheet). */
  wide: boolean;
  /** The panel element's id, for the trigger's `aria-controls`. */
  panelId: string;
}

/**
 * Kept apart from `friday-dock.tsx` so `PageHeader`'s trigger (on every page) does not pull the Ask chat into each
 * page's bundle; only the client layout imports the dock itself.
 */
export const FridayDockContext = createContext<FridayDockValue | null>(null);

/** The dock around this page, or null outside a client page with Ask (agency pages, guests, support, no `ask`). */
export function useFridayDock(): FridayDockValue | null {
  return useContext(FridayDockContext);
}

/** SSR and the first client render answer false (no hydration mismatch); `matchMedia` is guarded for jsdom/old browsers. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: { matches: boolean }) => setMatches(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}
