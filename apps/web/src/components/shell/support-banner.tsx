'use client';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BANNER_HEIGHT } from '@/components/shell/banner-height';

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
  // Height h-14 below `sm`, h-9 from `sm` up: from banner-height.ts.
  return (
    <div
      role="region"
      aria-label="Support session"
      className={`fixed inset-x-0 top-0 z-50 flex ${BANNER_HEIGHT.base} items-center bg-warning-surface px-4 text-sm text-ink shadow-[inset_3px_0_0_var(--warning)] ${BANNER_HEIGHT.sm}`}
      data-tone="warning"
    >
      {/* Below `sm` two lines (agency and reason; then minutes and Exit) so the reason stays readable at 390 px. */}
      <div className="mx-auto flex w-full min-w-0 max-w-[1560px] items-center gap-2">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-nowrap sm:flex-row sm:items-center sm:gap-1.5">
          {ended ? (
            <a href={`/support/end?sid=${encodeURIComponent(sessionId)}&next=%2Fagency`} className="font-semibold underline">
              Session ended — reload
            </a>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 max-w-[40%] truncate">
                  Viewing <strong>{agencyName}</strong>
                </span>
                <span className="flex-shrink-0">as platform · read only ·</span>
                <span className="min-w-0 truncate" title={reason}>
                  {reason}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {left !== null && (
                  <span data-testid="support-minutes">
                    <span className="hidden sm:inline">· </span>
                    {left} min left
                  </span>
                )}
                <span>·</span>
                <form method="post" action={SUPPORT_EXIT_PATH}>
                  <button type="submit" className="font-semibold underline">
                    Exit
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
