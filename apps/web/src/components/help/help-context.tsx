'use client';
import { NEUTRAL_AGENCY_NAME, type ViewerAudience } from '@cs/core';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { EmptyKey } from '@/help/copy';
import type { HelpCopy } from '@/help/copy/payload';
import { renderCopy } from '@/help/render';

export interface HelpViewer { audience: ViewerAudience; names: { agency: string; assistant: string; client?: string } }
/** `copy`: the short help copy this viewer's audience may read, resolved on the server (`helpCopyFor`; final review I1). */
export interface HelpValue extends HelpViewer { copy: HelpCopy }

/** Outside a provider: the most restrictive audience, neutral names and no copy. */
const FALLBACK: HelpValue = { audience: 'client', names: { agency: NEUTRAL_AGENCY_NAME, assistant: 'your assistant' }, copy: { tips: {}, empty: {}, terms: [] } };

const HelpContext = createContext<HelpValue>(FALLBACK);

/**
 * The client half of the help provider. Server code renders `HelpProvider` (`./help-provider`), which resolves `copy`
 * for the viewer's audience; this one only carries the value (and `ClientHelpName` re-provides it with the client name).
 */
export function HelpClientProvider({ value, children }: { value: HelpValue; children: React.ReactNode }) {
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpValue {
  return useContext(HelpContext);
}

/** A page's empty-state copy from the provider, or null when it is not for this viewer (render nothing then). */
export function useEmptyCopy(key: EmptyKey): HelpCopy['empty'][string] | null {
  return useContext(HelpContext).copy.empty[key] ?? null;
}
/** A short-copy string (`PAGE_COPY`) rendered with the viewer's names; for server pages that pass copy into markup. */
export function HelpText({ text }: { text: string }) {
  const { names, audience } = useHelp();
  return <>{renderCopy(text, names, audience)}</>;
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
