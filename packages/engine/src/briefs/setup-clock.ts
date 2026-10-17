/** Phase 11a spec §9: how long an open client setup holds the starting point before it falls back to the activation clock. */
export const SETUP_HOLD_DAYS = 14;

/**
 * When the starting point's 48 h wait begins. A client without a setup row (old clients, tests) or with a completed setup keeps
 * `activated_at ?? created_at`; an open setup waits for competitors to be picked/skipped (or the setup dismissed), capped at
 * 14 days. `null` = not due yet.
 */
export function startingPointClockStart(
  c: { activatedAt: Date | null; createdAt: Date },
  s: { competitorsDoneAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null,
  now: Date,
): Date | null {
  const base = c.activatedAt ?? c.createdAt;
  if (!s || s.completedAt) return base;
  const start = s.competitorsDoneAt ?? s.dismissedAt;
  if (start) return start;
  return now.getTime() - base.getTime() >= SETUP_HOLD_DAYS * 864e5 ? base : null; // null = not due yet
}
