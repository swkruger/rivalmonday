import { DEFAULT_SUPPORT_EMAIL, type PlanFeature } from '@cs/core';
import { type AgencyPlanChangeProps, type PlanTerms, renderEmail, resolveBranding } from '@cs/email';
import { sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';

type Admin = { email: string; name: string | null };

const errName = (e: unknown): string => (e instanceof Error ? e.name : 'unknown');
/** A Better Auth name that is just the address (sign-up default) greets as "Hi,". */
const firstNameSource = (a: Admin) => (!a.name || a.name.includes('@') ? null : a.name);

type Terms = PlanTerms & { features: PlanFeature[] };

/** True when any price term or the feature set differs (the caller still skips pilots). */
export function planChangeWorthEmailing(before: Terms, after: Terms): boolean {
  if (before.basePriceCents !== after.basePriceCents || before.includedSeats !== after.includedSeats || before.seatPriceCents !== after.seatPriceCents) return true;
  const b = new Set(before.features);
  const a = new Set(after.features);
  return b.size !== a.size || [...b].some((f) => !a.has(f));
}

/**
 * Phase 15c-3b spec §3.5: tells an agency's admins its plan moved to the current version. Mirrors `sendAgencyHoldEmail`:
 * direct through `deps.leadEmail`, Rival Monday branded, one email per distinct admin address, Reply-To the platform
 * support address, never throws, returns the number sent (0 without a transport). Logs carry the agency id and error name only.
 */
export async function sendAgencyPlanChangeEmail(
  deps: ToolDeps,
  agencyId: string,
  props: Omit<AgencyPlanChangeProps, 'branding' | 'recipientName' | 'agencyName'>,
): Promise<number> {
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
          template: 'agency_plan_change',
          props: { ...props, branding, recipientName: firstNameSource(admin), agencyName: a.name },
        });
        await mail.transport.send(
          { from: `"Rival Monday" <${mail.fromAddress}>`, to: admin.email, replyTo: supportEmail, subject: r.subject, html: r.html, text: r.text, tag: 'agency_plan_change', metadata: { agency: agencyId } },
          { agencyId, clientId: null },
        );
        sent++;
      } catch (err) {
        console.error('[plan-change-email] send failed', { agencyId, error: errName(err) });
      }
    }
  } catch (err) {
    console.error('[plan-change-email] failed', { agencyId, error: errName(err) });
  }
  return sent;
}
