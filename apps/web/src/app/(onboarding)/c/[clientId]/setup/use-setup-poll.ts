'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setupStatusAction } from './actions';
import type { ClientSetupView } from './types';

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 10_000;
const FAST_FOR_MS = 60_000;
const GIVE_UP_MS = 60 * 60_000;

const signature = (v: ClientSetupView) => `${v.state.steps.details}|${v.state.steps.profile}|${v.state.competitors}|${v.state.steps.invite}|${v.state.steps.billing ?? ''}|${v.invite.status}|${v.suggestions.status}|${v.search?.status ?? ''}|${v.state.open}`;

/**
 * Same shape as `useSearchProgress` (competitors/competitor-controls.tsx): every 5 s for the first minute, then every
 * 10 s, up to 60 minutes, and it stops as soon as nothing is pending or running. A change in what the server reports
 * (a step finished, suggestions arrived) re-fetches the page; the counters in between come from the polled data.
 */
export function useSetupPoll(clientId: string, view: ClientSetupView): ClientSetupView {
  const { refresh } = useRouter();
  const [polled, setPolled] = useState<ClientSetupView | null>(null);
  const [seen, setSeen] = useState(view);
  if (seen !== view) {
    setSeen(view);
    setPolled(null);
  }
  const waiting = view.suggestions.status === 'pending' || view.state.competitors === 'searching';
  const baseline = signature(view);
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      const elapsed = Date.now() - started;
      if (elapsed >= GIVE_UP_MS) return;
      timer = setTimeout(check, elapsed < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
    };
    const check = async () => {
      const r = await setupStatusAction(clientId).catch(() => null);
      if (stopped) return;
      if (r?.ok) {
        setPolled(r.data);
        if (signature(r.data) !== baseline) {
          refresh();
          return;
        }
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting, baseline, clientId, refresh]);
  return polled ?? view;
}
