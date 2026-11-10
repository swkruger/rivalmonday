'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { siteEnv } from '../../lib/env';
import { buildWaitlistBody, sessionStore, sourceFrom } from '../../lib/waitlist-body';
import { submitWaitlist } from '../../lib/waitlist-submit';
import { usePilot } from '../shell/pilot-context';
import { useSideOrHome } from '../shell/side-context';
import { JoinDialog, type JoinSubmit } from './join-dialog';

export type JoinStart = 'choose' | 'agency' | 'agency-sample' | 'business';

interface JoinValue {
  open(start?: JoinStart): void;
  isOpen: boolean;
  start: JoinStart;
  close(): void;
}

/** Drops `#join` and `?join=` from the address bar, so a reload does not reopen the popup and `<a href="#join">` fires hashchange again. */
function clearJoinUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  const search = url.searchParams.toString();
  const hash = url.hash === '#join' ? '' : url.hash;
  window.history.replaceState(null, '', url.pathname + (search ? `?${search}` : '') + hash);
}

/** The live submit: the waitlist body to the app's `/api/waitlist`. Nothing here logs or reports the form. */
const sendToWaitlist: JoinSubmit = (input, turnstileToken) =>
  submitWaitlist(siteEnv.appUrl, buildWaitlistBody(input, turnstileToken, sourceFrom(window.location, document.referrer, sessionStore())));

const JoinContext = createContext<JoinValue | null>(null);

/** Holds the join popup's open state and mounts the dialog. `#join` (also on hashchange) and `?join=business` open it. */
export function JoinProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [start, setStart] = useState<JoinStart>('choose');
  const [direct, setDirect] = useState(false);
  // Read at the moment of open(), so a client-side move between sides needs no remount.
  const side = useSideOrHome();
  const { pilotMode } = usePilot();
  const live = useRef({ side, pilotMode });
  live.current = { side, pilotMode };
  const open = useCallback((next?: JoinStart) => {
    const { side: now, pilotMode: pilotNow } = live.current;
    // No argument: the side picks the step. With the pilot off the agency side shows the choose step (its form is never shown).
    const byside: JoinStart = now === 'business' ? 'business' : now === 'agency' && pilotNow ? 'agency' : 'choose';
    setStart(next ?? byside);
    setDirect(now === 'agency' || now === 'business');
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    clearJoinUrl();
  }, []);
  useEffect(() => {
    // Record the first-touch source on landing, before an internal hop drops `utm_source` and the external referrer.
    sourceFrom(window.location, document.referrer, sessionStore());
  }, []);
  useEffect(() => {
    const fromUrl = () => {
      if (new URLSearchParams(window.location.search).get('join') === 'business') open('business');
      else if (window.location.hash === '#join') open();
      else return;
      clearJoinUrl();
    };
    fromUrl();
    const onHash = () => {
      if (window.location.hash === '#join') fromUrl();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [open]);
  const value = useMemo(() => ({ open, isOpen, start, close }), [open, isOpen, start, close]);
  return (
    <JoinContext.Provider value={value}>
      {children}
      <JoinDialog open={isOpen} start={start} direct={direct} onClose={close} submit={sendToWaitlist} />
    </JoinContext.Provider>
  );
}

export function useJoin(): JoinValue {
  const value = useContext(JoinContext);
  if (!value) throw new Error('useJoin must be used inside <JoinProvider>');
  return value;
}
