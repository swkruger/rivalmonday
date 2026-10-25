import { DEFAULT_SUPPORT_EMAIL } from '@cs/core';
import { renderEmail, resolveBranding } from '@cs/email';
import { sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';

type Admin = { email: string; name: string | null };

const errName = (e: unknown): string => (e instanceof Error ? e.name : 'unknown');
/** A Better Auth name that is just the address (sign-up default) greets as "Hi,". */
const firstNameSource = (a: Admin) => (!a.name || a.name.includes('@') ? null : a.name);

/**
 * Phase 15c-3a spec §4.4: tells an agency's admins its account was put on hold (`started`) or the hold was lifted
 * (`lifted`). Sent directly through `deps.leadEmail` (no client, so not the outbox), always Rival Monday branded, one
 * email per distinct admin address, Reply-To the platform support address. Call it after the hold/lift committed: it
 * never throws and returns the number of emails sent (0 without a transport). The hold reason never reaches it, and
 * logs carry the agency id and the error name only.
 */
export async function sendAgencyHoldEmail(deps: ToolDeps, agencyId: string, kind: 'started' | 'lifted'): Promise<number> {
  const mail = deps.leadEmail;
  if (!mail) return 0;
  let sent = 0;
  try {
    const [a] = [...(await deps.service.execute<{ name: string }>(sql`select name from agency where id = ${agencyId}`))];
    if (!a) return 0;
    const admins = [...(await deps.service.execute<Admin>(sql`
      select distinct on (lower(u.email)) lower(u.email) as email, u.name
      from membership m join auth."user" u on u.id = m.user_id
      where m.agency_id = ${agencyId} and m.role = 'agency_admin'
      order by lower(u.email)`))];
    const branding = resolveBranding('Rival Monday', null);
    const supportEmail = deps.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
    for (const admin of admins) {
      try {
        const r = await renderEmail({
          template: 'agency_hold',
          props: { branding, recipientName: firstNameSource(admin), agencyName: a.name, kind, supportEmail },
        });
        await mail.transport.send(
          { from: `"Rival Monday" <${mail.fromAddress}>`, to: admin.email, replyTo: supportEmail, subject: r.subject, html: r.html, text: r.text, tag: 'agency_hold', metadata: { agency: agencyId } },
          { agencyId, clientId: null },
        );
        sent++;
      } catch (err) {
        console.error('[hold-email] send failed', { agencyId, error: errName(err) });
      }
    }
  } catch (err) {
    console.error('[hold-email] failed', { agencyId, error: errName(err) });
  }
  return sent;
}
