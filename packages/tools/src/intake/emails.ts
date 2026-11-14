import { type Branding, cleanCc, type EmailPayload, type EmailTransport, PermanentEmailError, renderEmail, resolveBranding } from '@cs/email';
import { clientOriginFor, contact, type Db, intakeLink, lead, type LeadRow, rehostLogoUrl } from '@cs/db';
import { loadBranding, platformSender, replyToFor, type SenderConfig, senderFor } from '@cs/engine';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { platformOperatorEmails } from '../platform/costs/alerts';

// Phase 11c Task 30 (plan R1): lead mail is sent directly (the `notification` outbox needs a client). Guard columns are claimed with
// `UPDATE … WHERE <col> IS NULL RETURNING` before sending; if every send fails the column is cleared so the next cleanup run retries.
// Never log addresses, tokens or business names: a failure logs the lead id and kind only.

export type LeadEmailKind = 'verify' | 'confirmation' | 'declined' | 'agency_new' | 'pool_new';

export interface LeadEmailDeps {
  service: Db;
  transport: EmailTransport;
  appUrl: string;
  /** 13a1 (N1): mail to an agency's lead uses that agency's client sender; agency staff, operators and pool leads the platform sender. */
  sender: SenderConfig;
  platformAdmins: string[];
}

const GUARD = {
  confirmation: lead.confirmationSentAt,
  declined: lead.declinedNotifiedAt,
  agency_new: lead.agencyNotifiedAt,
  pool_new: lead.poolNotifiedAt,
} as const;
const GUARD_KEY = { confirmation: 'confirmationSentAt', declined: 'declinedNotifiedAt', agency_new: 'agencyNotifiedAt', pool_new: 'poolNotifiedAt' } as const;

const base = (appUrl: string) => appUrl.replace(/\/+$/, '');

/** Agency admins plus account managers who cover every client (`client_scope` null). */
async function agencyRecipients(db: Db, agencyId: string): Promise<string[]> {
  const rows = await db
    .select({ email: contact.email })
    .from(contact)
    .where(and(eq(contact.agencyId, agencyId), isNull(contact.clientId), eq(contact.active, true), or(eq(contact.role, 'agency_admin'), and(eq(contact.role, 'account_manager'), isNull(contact.clientScope)))));
  return [...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))];
}

export async function sendLeadEmail(
  deps: LeadEmailDeps,
  leadId: string,
  kind: LeadEmailKind,
  extra?: { verifyRaw?: string; viewRaw?: string },
): Promise<void> {
  const [row] = await deps.service.select().from(lead).where(eq(lead.id, leadId));
  if (!row) return;
  if ((kind === 'declined' || kind === 'agency_new') && !row.agencyId) return; // agency mail needs an owning agency
  if (kind === 'pool_new' && row.agencyId) return; // assigned leads notify the agency instead
  if (kind === 'verify' && !extra?.verifyRaw) throw new Error('verify email needs verifyRaw');

  if (kind !== 'verify') {
    const claimed = await deps.service.update(lead).set({ [GUARD_KEY[kind]]: new Date() }).where(and(eq(lead.id, leadId), isNull(GUARD[kind]))).returning({ id: lead.id });
    if (claimed.length === 0) return; // already sent (or being sent) once
  }

  let sent = 0;
  try {
    const msgs = await build(deps, row, kind, extra);
    // N1: the lead itself (verify/confirmation/declined) hears from its agency; staff (agency_new) and pool mail (pool_new, operators) from the platform.
    const s = row.agencyId && kind !== 'agency_new' && kind !== 'pool_new' ? await senderFor(deps.service, row.agencyId, 'client', deps.sender) : { from: platformSender(deps.sender) };
    for (const m of msgs) {
      try {
        const r = await renderEmail(m.payload);
        await deps.transport.send(
          { from: s.from, to: m.to, cc: cleanCc(undefined, m.to), replyTo: s.replyTo ?? m.replyTo, subject: r.subject, html: r.html, text: r.text, tag: `lead_${kind}`, metadata: { lead: leadId } },
          { agencyId: row.agencyId, clientId: null },
        );
        sent++;
      } catch (err) {
        // eslint-disable-next-line no-console -- ids only: never the address, token or business
        console.error(`[lead-email] send failed lead=${leadId} kind=${kind}${err instanceof PermanentEmailError ? ' permanent' : ''}`);
      }
    }
  } catch {
    // eslint-disable-next-line no-console -- building the message failed
    console.error(`[lead-email] build failed lead=${leadId} kind=${kind}`);
  }
  // Nothing went out: free the guard so the next cleanup run retries (a partial send keeps it to avoid duplicates).
  if (sent === 0 && kind !== 'verify') await deps.service.update(lead).set({ [GUARD_KEY[kind]]: null }).where(eq(lead.id, leadId));
}

interface Msg { to: string; replyTo: string | null; branding: Branding; payload: EmailPayload }

async function build(deps: LeadEmailDeps, row: LeadRow, kind: LeadEmailKind, extra?: { verifyRaw?: string }): Promise<Msg[]> {
  const businessName = row.lookup.title;
  const appUrl = base(deps.appUrl);
  const platformBranding = resolveBranding('Rival Monday', null);
  const agencyBranding = row.agencyId ? await loadBranding(deps.service, row.agencyId) : platformBranding;
  // 13a1 P8/P12: mail to an agency's lead links to and shows its logo from the agency's client origin; staff mail (agency_new) and pool leads keep APP_URL.
  const clientOrigin = row.agencyId && kind !== 'agency_new' ? await clientOriginFor(deps.service, row.agencyId, deps.sender.hostEnv) : null;
  const branding = clientOrigin ? { ...agencyBranding, logoUrl: rehostLogoUrl(agencyBranding.logoUrl, deps.sender.hostEnv, clientOrigin) } : agencyBranding;
  // Pool-notice mail to operators always carries platform branding; everything else follows the lead's owner.
  const agencyName = row.agencyId ? branding.displayName : null;
  const replyTo = row.agencyId ? ((await replyToFor(deps.service, row.agencyId, row.id))?.email ?? null) : null;

  switch (kind) {
    case 'verify': {
      // `from` lets an expired link point back to the right intake page (agency-branded); `-` = agency lead without a slug.
      let from = '';
      if (row.agencyId) {
        const [l] = await deps.service.select({ slug: intakeLink.slug }).from(intakeLink).where(eq(intakeLink.agencyId, row.agencyId));
        from = `?from=${l?.slug ?? '-'}`;
      }
      return [{ to: row.email, replyTo, branding, payload: { template: 'lead_verify', props: { branding, businessName, verifyUrl: `${clientOrigin ?? appUrl}/start/verify/${extra!.verifyRaw}${from}` } } }];
    }
    case 'confirmation':
      return [{ to: row.email, replyTo, branding, payload: { template: 'lead_confirmation', props: { branding, businessName, agencyName, preview: row.preview } } }];
    case 'declined':
      return [{ to: row.email, replyTo, branding, payload: { template: 'lead_declined', props: { branding, businessName, agencyName: branding.displayName } } }];
    case 'agency_new': {
      const props = { branding, businessName, contactName: row.contactName, contactEmail: row.email, contactPhone: row.phone, ref: row.ref, leadsUrl: `${appUrl}/agency/leads`, pool: false };
      return (await agencyRecipients(deps.service, row.agencyId!)).map((to) => ({ to, replyTo: null, branding, payload: { template: 'lead_new', props } }));
    }
    case 'pool_new': {
      const props = { branding: platformBranding, businessName, contactName: row.contactName, contactEmail: row.email, contactPhone: row.phone, ref: row.ref, leadsUrl: `${appUrl}/platform/leads`, pool: true };
      return (await platformOperatorEmails(deps, ['owner', 'staff'])).map((to) => ({ to, replyTo: null, branding: platformBranding, payload: { template: 'lead_new', props } }));
    }
  }
}
