'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { JoinDialog } from './join-dialog';

export type JoinStart = 'choose' | 'agency' | 'agency-sample' | 'business';

interface JoinValue {
  open(start?: JoinStart): void;
  isOpen: boolean;
  start: JoinStart;
  close(): void;
}

const JoinContext = createContext<JoinValue | null>(null);

/** Holds the join popup's open state and mounts the dialog. `#join` (also on hashchange) and `?join=business` open it. */
export function JoinProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [start, setStart] = useState<JoinStart>('choose');
  const open = useCallback((next: JoinStart = 'choose') => {
    setStart(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('join') === 'business') open('business');
    else if (window.location.hash === '#join') open('choose');
    const onHash = () => {
      if (window.location.hash === '#join') open('choose');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [open]);
  const value = useMemo(() => ({ open, isOpen, start, close }), [open, isOpen, start, close]);
  return (
    <JoinContext.Provider value={value}>
      {children}
      <JoinDialog open={isOpen} start={start} onClose={close} />
    </JoinContext.Provider>
  );
}

export function useJoin(): JoinValue {
  const value = useContext(JoinContext);
  if (!value) throw new Error('useJoin must be used inside <JoinProvider>');
  return value;
}
