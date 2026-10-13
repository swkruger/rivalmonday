import 'server-only';
import type { Db } from '@cs/db';
import { type EmailTransport, renderEmail, resolveBranding } from '@cs/email';
import { sql } from 'drizzle-orm';

/**
 * Phase 8b R6: the "support session started" notice. Not an outbox notification (those are client-scoped): sent directly,
 * like magic links. Best-effort and never throws; the session is already open when this runs, and nothing it logs carries
 * an address, a name or the reason.
 */
export interface SupportEmailDeps {
  service: Db;
  transport: EmailTransport;
  from: string;
}

type Row = { agency_id: string; reason: string; started_at: string | Date; notify: boolean; admin_name: string };
type Admin = { email: string; name: string };

const dateOf = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
const firstNameSource = (a: Admin) => (a.name.includes('@') ? null : a.name);

export async function sendSupportSessionStartedEmailWith(deps: SupportEmailDeps, sessionId: string): Promise<void> {
  try {
    const [row] = [...(await deps.service.execute<Row>(sql`
      select s.agency_id, s.reason, s.started_at, a.notify_support_access as notify, u.name as admin_name
      from support_session s
      join agency a on a.id = s.agency_id
      join auth."user" u on u.id = s.platform_user_id
      where s.id = ${sessionId}`))];
    if (!row || !row.notify) return;
    const admins = [...(await deps.service.execute<Admin>(sql`
      select distinct on (lower(u.email)) u.email, u.name
      from membership m join auth."user" u on u.id = m.user_id
      where m.agency_id = ${row.agency_id} and m.role = 'agency_admin'
      order by lower(u.email)`))];
    if (admins.length === 0) return;
    const branding = resolveBranding('Rival Monday', null);
    const date = dateOf(new Date(row.started_at));
    for (const admin of admins) {
      try {
        const r = await renderEmail({
          template: 'support_session_started',
          props: { branding, recipientName: firstNameSource(admin), platformAdminName: row.admin_name, date, reason: row.reason },
        });
        await deps.transport.send(
          { from: deps.from, to: admin.email, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'support_session_started', metadata: {} },
          { agencyId: row.agency_id, clientId: null },
        );
      } catch (err) {
        // eslint-disable-next-line no-console -- best-effort: log the failure class only, no PII
        console.error('[support-email] send failed', { sessionId, error: err instanceof Error ? err.name : 'unknown' });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- best-effort: log the failure class only, no PII
    console.error('[support-email] failed', { sessionId, error: err instanceof Error ? err.name : 'unknown' });
  }
}

/** Production wiring (same transport choice as magic links). Task 8's start action calls this after a successful start. */
export async function sendSupportSessionStartedEmail(sessionId: string): Promise<void> {
  try {
    const [{ createLedgerSink }, { dbs }, { processGuardOn }, { webEmailTransport }, { webEnv }] = await Promise.all([
      import('@cs/db'),
      import('./db'),
      import('./dev-guard'),
      import('./email-transport'),
      import('./env'),
    ]);
    const { service } = dbs();
    const env = webEnv();
    await sendSupportSessionStartedEmailWith({ service, transport: webEmailTransport(processGuardOn(), process.env, createLedgerSink(service)), from: env.emailFrom }, sessionId);
  } catch (err) {
    // eslint-disable-next-line no-console -- best-effort: log the failure class only, no PII
    console.error('[support-email] setup failed', { sessionId, error: err instanceof Error ? err.name : 'unknown' });
  }
}
