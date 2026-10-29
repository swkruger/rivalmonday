'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { siteEnv } from '../../lib/env';
import { fetchSiteStatus, type SiteStatus } from '../../lib/site-status';

interface PilotValue {
  pilotMode: boolean;
  status: SiteStatus | null;
  loaded: boolean;
}

const PilotContext = createContext<PilotValue>({ pilotMode: true, status: null, loaded: false });

/** Fetches `/api/site-status` once on mount. Pilot mode is on until the app says otherwise. */
export function PilotProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: SiteStatus | null; loaded: boolean }>({ status: null, loaded: false });

  useEffect(() => {
    const controller = new AbortController();
    fetchSiteStatus(siteEnv.appUrl, controller.signal)
      .catch(() => null)
      .then((status) => {
        if (!controller.signal.aborted) setState({ status, loaded: true });
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<PilotValue>(() => {
    const { status, loaded } = state;
    // A degraded 17a answer ({ counters: null }, e.g. DB error) must not flip the site out of pilot mode.
    const pilotMode = status && status.counters !== null ? status.pilotMode : true;
    return { pilotMode, status, loaded };
  }, [state]);

  return <PilotContext.Provider value={value}>{children}</PilotContext.Provider>;
}

export function usePilot(): PilotValue {
  return useContext(PilotContext);
}
