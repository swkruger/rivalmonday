'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type JoinStart = 'choose' | 'agency' | 'agency-sample' | 'business';

interface JoinValue {
  open(start?: JoinStart): void;
  isOpen: boolean;
  start: JoinStart;
  close(): void;
}

const JoinContext = createContext<JoinValue | null>(null);

/** Holds the join popup's open state. Task 7 mounts the dialog inside this provider. */
export function JoinProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [start, setStart] = useState<JoinStart>('choose');
  const open = useCallback((next: JoinStart = 'choose') => {
    setStart(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, isOpen, start, close }), [open, isOpen, start, close]);
  return <JoinContext.Provider value={value}>{children}</JoinContext.Provider>;
}

export function useJoin(): JoinValue {
  const value = useContext(JoinContext);
  if (!value) throw new Error('useJoin must be used inside <JoinProvider>');
  return value;
}
