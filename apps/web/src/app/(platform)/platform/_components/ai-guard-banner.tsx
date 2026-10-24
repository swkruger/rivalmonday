import Link from 'next/link';
import { spikePausedCopy, spikeWarnCopy } from '@/lib/platform-spend-copy';

export interface AiGuardBannerState {
  state: 'ok' | 'warn' | 'paused';
  scope?: string;
  observedUsd?: number;
  baselineUsd?: number;
}

/** 7b1 C7/C8: calm notice (never red) at the top of every platform page while the spike guard warns or has paused all AI. */
export function AiGuardBanner({ state }: { state: AiGuardBannerState | null }) {
  if (!state || state.state === 'ok') return null;
  const text = state.state === 'paused' ? spikePausedCopy(state.scope) : spikeWarnCopy(state.scope, state.observedUsd, state.baselineUsd);
  return (
    <div role="region" aria-label="AI spend guard" className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted-surface px-4 py-2 text-sm font-semibold text-ink lg:px-7">
      <p>{text}</p>
      <Link href="/platform/health" className="rounded-md bg-white px-3 py-1 text-xs font-bold text-ink hover:opacity-90">
        Open Health
      </Link>
    </div>
  );
}
