import { type AccessContext, maskEmail } from '@cs/core';

/**
 * Phase 8b: masking for the few pages that read e-mail addresses through a plain service function instead of a
 * registered tool (Task 0 inventory: team, delivery recipients). The registry masks tool output itself; these
 * helpers run in the Server Component so the raw address never reaches a client component's props.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+$/;

export function maskTeamForSupport<
  M extends { email: string; name: string },
  I extends { email: string },
>(ctx: AccessContext, team: { members: M[]; invitations: I[] }): { members: M[]; invitations: I[] } {
  if (!ctx.support) return team;
  return {
    members: team.members.map((m) => ({
      ...m,
      email: maskEmail(m.email),
      name: LOOKS_LIKE_EMAIL.test(m.name.trim()) ? maskEmail(m.name.trim()) : m.name,
    })),
    invitations: team.invitations.map((i) => ({ ...i, email: maskEmail(i.email) })),
  };
}

export function maskRecipientsForSupport<R extends { email: string; name: string | null }>(ctx: AccessContext, rows: R[]): R[] {
  if (!ctx.support) return rows;
  return rows.map((r) => ({
    ...r,
    email: maskEmail(r.email),
    name: r.name && LOOKS_LIKE_EMAIL.test(r.name.trim()) ? maskEmail(r.name.trim()) : r.name,
  }));
}
