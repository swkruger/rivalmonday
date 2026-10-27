/** Phase 11a spec §9: how long an open client setup holds the starting point before it falls back to the activation clock. */
export const SETUP_HOLD_DAYS = 14;

/**
 * When the starting point's 48 h wait begins (D8). A setup row with `competitors_done_at` / `dismissed_at` starts the clock
 * there, open or completed. A client without a setup row (old clients, tests) or with a completed row that has neither
 * (backfilled) keeps `activated_at ?? created_at`; an open setup with neither waits, capped at 14 days. `null` = not due yet.
 * Phase 16 O12/P7: once the agency asked the owner to pick (`owner_pick_requested_at`), the clock waits for the owner's
 * pick (`competitors_done_at`) — even when staff completed or dismissed the setup — capped at 14 days after the request.
 */
export function startingPointClockStart(
  c: { activatedAt: Date | null; createdAt: Date },
  s: { competitorsDoneAt: Date | null; ownerPickRequestedAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null,
  now: Date,
): Date | null {
  const base = c.activatedAt ?? c.createdAt;
  if (!s) return base;
  if (s.ownerPickRequestedAt) {
    if (s.competitorsDoneAt) return s.competitorsDoneAt;
    const cap = new Date(s.ownerPickRequestedAt.getTime() + SETUP_HOLD_DAYS * 864e5);
    return now.getTime() >= cap.getTime() ? cap : null; // null = still waiting for the owner
  }
  const start = s.competitorsDoneAt ?? s.dismissedAt;
  if (start) return start;
  if (s.completedAt) return base; // backfilled rows for pre-existing clients
  return now.getTime() - base.getTime() >= SETUP_HOLD_DAYS * 864e5 ? base : null; // null = not due yet
}
