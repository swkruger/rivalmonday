'use client';
import { createContext, useContext } from 'react';

/**
 * Phase 8b S3: the app layout sets `readOnly` while a platform operator is inside a support session, and every write
 * control hides itself through `WriteGuard`. This is presentation only: the registry's `read_only_session` refusal (g10)
 * is the guarantee.
 */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ readOnly, children }: { readOnly: boolean; children: React.ReactNode }) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** Renders its children only outside a read-only support session. */
export function WriteGuard({ children }: { children: React.ReactNode }) {
  return useReadOnly() ? null : <>{children}</>;
}
