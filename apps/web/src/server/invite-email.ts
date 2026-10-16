import 'server-only';
import { createLedgerSink } from '@cs/db';
import { type EmailTransport, renderEmail, resolveBranding } from '@cs/email';

/**
 * Phase 10 Task 14 (R5): the console's "Email it to the locked address". Sent directly (no outbox), so the redeem link
 * is held only in memory and in the message itself; nothing here logs the URL, the token or the address.
 */
export interface InviteEmailDeps {
  transport: EmailTransport;
  from: string;
  /** `SUPPORT_REPLY_TO`; falls back to the support address. */
  replyTo: string | null;
}

export interface InviteEmailInput {
  to: string;
  url: string;
  offer: 'trial' | 'pilot';
  pilotEndsAt?: string;
  expiresAt: string;
  discountText?: string;
}

const SUPPORT = 'support@rivalmonday.app';

/** Throws on a render or transport failure; the caller decides what the operator sees. */
export async function sendAgencyInviteEmailWith(deps: InviteEmailDeps, i: InviteEmailInput): Promise<void> {
  const r = await renderEmail({
    template: 'agency_invite',
    props: {
      branding: resolveBranding('Rival Monday', null), url: i.url, offer: i.offer, expiresAt: i.expiresAt,
      ...(i.pilotEndsAt ? { pilotEndsAt: i.pilotEndsAt } : {}), ...(i.discountText ? { discountText: i.discountText } : {}),
    },
  });
  await deps.transport.send(
    { from: deps.from, to: i.to, replyTo: deps.replyTo ?? SUPPORT, subject: r.subject, html: r.html, text: r.text, tag: 'agency_invite', metadata: {} },
    { agencyId: null, clientId: null },
  );
}

/** Production wiring (same transport choice as magic links). Throws on failure. */
export async function sendAgencyInviteEmail(i: InviteEmailInput & { discountCodeId?: string }): Promise<void> {
  const [{ dbs }, { processGuardOn }, { webEmailTransport }, { webEnv }, { discountText }] = await Promise.all([
    import('./db'),
    import('./dev-guard'),
    import('./email-transport'),
    import('./env'),
    import('@/app/join/[token]/offer'),
  ]);
  const { service } = dbs();
  const env = webEnv();
  const text = i.discountText ?? (i.discountCodeId ? await discountText(service, { discountCodeId: i.discountCodeId }) : null);
  const { discountCodeId: _omit, ...rest } = i;
  await sendAgencyInviteEmailWith(
    { transport: webEmailTransport(processGuardOn(), process.env, createLedgerSink(service)), from: env.emailFrom, replyTo: env.supportReplyTo ?? null },
    { ...rest, ...(text ? { discountText: text } : {}) },
  );
}
