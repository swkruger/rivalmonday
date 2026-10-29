import { client, waitlistEntry } from '@cs/db';
import { type EmailPayload, PermanentEmailError, renderEmail, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import { type LeadEmailDeps, quoteName } from '../intake/emails';

// Phase 17a: waitlist mail is sent directly (no client, so no `notification` outbox). Throws on send failure so the caller decides.
// Never log addresses, tokens or organisation names: a failure logs the entry id and kind only.

export type WaitlistEmailKind = 'confirmation' | 'sample_ready';

const TAG: Record<WaitlistEmailKind, string> = { confirmation: 'waitlist_confirmation', sample_ready: 'sample_brief_ready' };

export async function sendWaitlistEmail(
  deps: LeadEmailDeps,
  entryId: string,
  kind: WaitlistEmailKind,
  extra: { confirmRaw?: string; sampleUrl?: string; expiresAt?: string },
): Promise<void> {
  if (kind === 'confirmation' && !extra.confirmRaw) throw new Error('confirmation email needs confirmRaw');
  if (kind === 'sample_ready' && (!extra.sampleUrl || !extra.expiresAt)) throw new Error('sample_ready email needs sampleUrl and expiresAt');
  const [row] = await deps.service.select().from(waitlistEntry).where(eq(waitlistEntry.id, entryId));
  if (!row) return;
  const branding = resolveBranding('Rival Monday', null);
  let payload: EmailPayload;
  if (kind === 'confirmation') {
    const confirmUrl = `${deps.appUrl.replace(/\/+$/, '')}/waitlist/confirm/${extra.confirmRaw}`;
    payload = {
      template: 'waitlist_confirmation',
      props: {
        branding, kind: row.kind, contactName: row.contactName, orgName: row.orgName, confirmUrl,
        sampleBusinessName: row.kind === 'agency' && row.sampleRequested ? row.sampleBusinessName : null,
      },
    };
  } else {
    // The sample client's name is the picked Google listing, the same name the sample page shows.
    const [c] = row.sampleClientId ? await deps.service.select({ name: client.name }).from(client).where(eq(client.id, row.sampleClientId)) : [];
    const businessName = c?.name ?? row.sampleBusinessName ?? row.orgName;
    payload = { template: 'sample_brief_ready', props: { branding, contactName: row.contactName, businessName, url: extra.sampleUrl!, expiresAt: extra.expiresAt! } };
  }
  try {
    const r = await renderEmail(payload);
    await deps.transport.send(
      {
        from: `${quoteName('Rival Monday')} <${deps.fromAddress}>`, to: row.email, replyTo: 'support@rivalmonday.app',
        subject: r.subject, html: r.html, text: r.text, tag: TAG[kind], metadata: { waitlist: entryId },
      },
      { agencyId: null, clientId: null },
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- ids only: never the address, token or organisation
    console.error(`[waitlist-email] send failed entry=${entryId} kind=${kind}${err instanceof PermanentEmailError ? ' permanent' : ''}`);
    throw err;
  }
}
