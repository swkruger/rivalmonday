import { waitlistEntry } from '@cs/db';
import { PermanentEmailError, renderEmail, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import { type LeadEmailDeps, quoteName } from '../intake/emails';

// Phase 17a: waitlist mail is sent directly (no client, so no `notification` outbox). Throws on send failure so the caller decides.
// Never log addresses, tokens or organisation names: a failure logs the entry id and kind only.

export type WaitlistEmailKind = 'confirmation' | 'sample_ready';

export async function sendWaitlistEmail(
  deps: LeadEmailDeps,
  entryId: string,
  kind: WaitlistEmailKind,
  extra: { confirmRaw?: string; sampleUrl?: string; expiresAt?: string },
): Promise<void> {
  if (kind !== 'confirmation') throw new Error('not implemented'); // sample_ready: wired in Task 11
  if (!extra.confirmRaw) throw new Error('confirmation email needs confirmRaw');
  const [row] = await deps.service.select().from(waitlistEntry).where(eq(waitlistEntry.id, entryId));
  if (!row) return;
  const branding = resolveBranding('Rival Monday', null);
  const confirmUrl = `${deps.appUrl.replace(/\/+$/, '')}/waitlist/confirm/${extra.confirmRaw}`;
  try {
    const r = await renderEmail({
      template: 'waitlist_confirmation',
      props: {
        branding, kind: row.kind, contactName: row.contactName, orgName: row.orgName, confirmUrl,
        sampleBusinessName: row.kind === 'agency' && row.sampleRequested ? row.sampleBusinessName : null,
      },
    });
    await deps.transport.send(
      {
        from: `${quoteName('Rival Monday')} <${deps.fromAddress}>`, to: row.email, replyTo: 'support@rivalmonday.app',
        subject: r.subject, html: r.html, text: r.text, tag: 'waitlist_confirmation', metadata: { waitlist: entryId },
      },
      { agencyId: null, clientId: null },
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- ids only: never the address, token or organisation
    console.error(`[waitlist-email] send failed entry=${entryId} kind=${kind}${err instanceof PermanentEmailError ? ' permanent' : ''}`);
    throw err;
  }
}
