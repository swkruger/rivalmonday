'use client';
import type { ViewerAudience } from '@cs/core';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { renderCopy } from '@/help/copy';

export interface HelpValue { audience: ViewerAudience; names: { agency: string; assistant: string; client?: string } }

/** Outside a provider: the most restrictive audience and neutral names. */
const FALLBACK: HelpValue = { audience: 'client', names: { agency: 'your agency', assistant: 'your assistant' } };

const HelpContext = createContext<HelpValue>(FALLBACK);

export function HelpProvider({ value, children }: { value: HelpValue; children: React.ReactNode }) {
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpValue {
  return useContext(HelpContext);
}

/** A short-copy string (`PAGE_COPY`) rendered with the viewer's names; for server pages that pass copy into markup. */
export function HelpText({ text }: { text: string }) {
  return <>{renderCopy(text, useHelp().names)}</>;
}

/*
 * Whether the current page has a guide for this viewer: `PageGuide` (which `PageHeader` renders only when it does)
 * registers itself while mounted. "More in the guide" links in `HelpTip`/`EmptyState` show only then, so they never
 * dispatch an event nobody listens to. A module store rather than a context: the tips sit outside `PageHeader`'s subtree.
 */
let mountedGuides = 0;
const guideListeners = new Set<() => void>();
const notifyGuides = () => {
  for (const l of guideListeners) l();
};
const subscribeGuides = (l: () => void) => {
  guideListeners.add(l);
  return () => {
    guideListeners.delete(l);
  };
};

/** Called by `PageGuide`: the page has a guide while the component is mounted. */
export function useRegisterPageGuide(): void {
  useEffect(() => {
    mountedGuides++;
    notifyGuides();
    return () => {
      mountedGuides--;
      notifyGuides();
    };
  }, []);
}

/** True while a `PageGuide` is mounted (false on the server and before hydration). */
export function usePageGuideAvailable(): boolean {
  return useSyncExternalStore(subscribeGuides, () => mountedGuides > 0, () => false);
}
