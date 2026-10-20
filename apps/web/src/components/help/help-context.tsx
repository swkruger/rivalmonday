'use client';
import type { ViewerAudience } from '@cs/core';
import { createContext, useContext } from 'react';

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
