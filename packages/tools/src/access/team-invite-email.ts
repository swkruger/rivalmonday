import { cleanCc, PermanentEmailError, renderEmail } from '@cs/email';
import { loadBranding } from '@cs/engine';
import { sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { quoteName } from '../intake/emails';

/** Who the invite email speaks for: a person (named, Cc/reply-to) or the agency itself (platform staff acting for it). */
export type Inviter = { userId: string } | { agency: true };

export type TeamInviteRole = 'agency_admin' | 'account_manager';

/** B14 wording (`MEMBERSHIP_ROLE` in apps/web `lib/labels.ts`). */
const ROLE_LABEL: Record<TeamInviteRole, string> = { agency_admin: 'Agency admin', account_manager: 'Account manager' };

/** "Nov 6, 2026": the year always shows; UTC, since the reader's zone is unknown. */
const expiryDate = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);

/**
 * 15c-2a D7 / B1: emails an agency-role invitee directly (the outbox needs a client), through the transport `deps.leadEmail`
 * carries. Call it after the invitation committed: it never throws, so a failed send never undoes the invitation. Returns
 * false when mail is not configured or the send failed. Logs the agency id only: never the address or the sign-in URL.
 */
export async function sendTeamInviteEmail(
  deps: ToolDeps,
  i: { agencyId: string; to: string; role: TeamInviteRole; inviter: Inviter; expiresAt: Date },
): Promise<boolean> {
  const mail = deps.leadEmail;
  if (!mail) {
    console.warn(`[team-invite] email is not configured; invitation created without an email agency=${i.agencyId}`);
    return false;
  }
  try {
    const branding = await loadBranding(deps.service, i.agencyId);
    // `{ agency: true }`: no `auth.user` lookup, the agency's display name speaks and nothing replies to a person (platform staff never appear).
    const rows = 'userId' in i.inviter
      ? await deps.service.execute<{ name: string | null; email: string }>(sql`select name, email from auth."user" where id = ${i.inviter.userId}`)
      : [];
    const inviter = [...rows][0];
    const to = i.to.trim().toLowerCase();
    // Built from the stored address only; the sign-in page re-checks `next` with `safeNext`.
    const signInUrl = `${mail.appUrl.replace(/\/+$/, '')}/sign-in?email=${encodeURIComponent(to)}&next=${encodeURIComponent('/agency')}`;
    const r = await renderEmail({
      template: 'team_invite',
      props: { branding, inviterName: inviter?.name?.trim() || inviter?.email || branding.displayName, agencyName: branding.displayName, roleLabel: ROLE_LABEL[i.role], expiryDate: expiryDate(i.expiresAt), signInUrl },
    });
    await mail.transport.send(
      { from: `${quoteName(branding.fromName)} <${mail.fromAddress}>`, to, cc: cleanCc(undefined, to), replyTo: inviter?.email ?? null, subject: r.subject, html: r.html, text: r.text, tag: 'team_invite', metadata: { agency: i.agencyId } },
      { agencyId: i.agencyId, clientId: null },
    );
    return true;
  } catch (err) {
    console.error(`[team-invite] send failed agency=${i.agencyId}${err instanceof PermanentEmailError ? ' permanent' : ''}`);
    return false;
  }
}
