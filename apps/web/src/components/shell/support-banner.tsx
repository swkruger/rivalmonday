'use client';
import { useEffect, useState } from 'react';

/** Where the banner's Exit posts (`app/support/exit/route.ts`). */
export const SUPPORT_EXIT_PATH = '/support/exit';
const TICK_MS = 30_000;

export const minutesLeft = (expiresAt: string, now: number) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));

/**
 * Phase 8b spec § UI: fixed accent bar on every `/agency/*` and `/c/*` page while a support session is open. The countdown
 * is client-only (it starts after mount, so server and client markup agree) and ticks every 30 s; the server stays
 * authoritative. At 0 "Session ended — reload" goes through `/support/end` with this session's id, which ends the row as
 * `expired` and returns the operator to the agency's console page.
 */
export function SupportBanner({ sessionId, agencyName, reason, expiresAt }: { sessionId: string; agencyName: string; reason: string; expiresAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(minutesLeft(expiresAt, Date.now()));
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [expiresAt]);
  const ended = left === 0;
  return (
    <div role="region" aria-label="Support session" className="fixed inset-x-0 top-0 z-50 flex h-9 items-center bg-amber px-4 text-sm text-amber-text">
      <div className="mx-auto flex w-full min-w-0 max-w-[1560px] items-center gap-1.5 whitespace-nowrap">
        {ended ? (
          <a href={`/support/end?sid=${encodeURIComponent(sessionId)}&next=%2Fagency`} className="font-bold underline">
            Session ended — reload
          </a>
        ) : (
          <>
            <span className="min-w-0 max-w-[40%] truncate">
              Viewing <strong>{agencyName}</strong>
            </span>
            <span className="flex-shrink-0">as platform · read only ·</span>
            <span className="min-w-0 truncate" title={reason}>
              {reason}
            </span>
            {left !== null && <span className="flex-shrink-0">· {left} min left</span>}
            <span className="flex-shrink-0">·</span>
            <form method="post" action={SUPPORT_EXIT_PATH} className="flex-shrink-0">
              <button type="submit" className="font-bold underline">
                Exit
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
