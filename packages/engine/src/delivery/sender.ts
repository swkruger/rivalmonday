import type { AgencyBranding, HostEnv } from '@cs/db';
import { quoteName, resolveBranding } from '@cs/email';
import { sql } from 'drizzle-orm';
import type { Audience, Conn } from './contacts';

/**
 * Phase 13a1 (P14, P15, N1): every From address. Client audience (client contacts, an agency's own leads) = the agency's
 * verified sending domain, else `<host_slug>@mail.<neutral>`: never `EMAIL_FROM` or a Rival Monday domain. Agency audience
 * (agency staff) and pool leads = the platform sender.
 */
export interface SenderConfig {
  hostEnv: HostEnv;
  /** `EMAIL_FROM || briefs@<APP_URL host>` (`platformFromEnv`). */
  platformFrom: string;
}

/** The platform's own sending address; needs no host env (hold, plan change, waitlist and platform notices use it). '' when neither is set. */
export const platformFromEnv = (env: NodeJS.ProcessEnv): string => {
  const from = env.EMAIL_FROM?.trim();
  if (from) return from;
  try {
    return env.APP_URL?.trim() ? `briefs@${new URL(env.APP_URL.trim()).hostname}` : '';
  } catch {
    return '';
  }
};

/** P15: mail to agency staff and platform operators. */
export const platformSender = (cfg: Pick<SenderConfig, 'platformFrom'>) => `"Rival Monday" <${cfg.platformFrom}>`;

/** P15: the MCP host's sign-in email (no agency known yet). */
export const mcpSignInSender = (h: HostEnv) => `"Sign in" <sign-in@mail.${h.neutralDomain}>`;

type Row = { name: string; branding: AgencyBranding | null; host_slug: string; domain: string | null; local_part: string | null };

/** One query: the agency's name, branding, host slug and its verified sending domain (if any). Unknown agency → throws. */
async function loadSenderRow(db: Conn, agencyId: string): Promise<Row> {
  const rows = (await db.execute(sql`
    SELECT a.name, a.branding, a.host_slug, s.domain, s.local_part FROM agency a
    LEFT JOIN agency_sending_domain s ON s.agency_id = a.id AND s.status = 'verified'
    WHERE a.id = ${agencyId}::uuid LIMIT 1`)) as unknown as Row[];
  const r = rows[0];
  if (!r) throw new Error(`senderFor: unknown agency ${agencyId}`);
  return r;
}

const clientAddress = (r: Row, h: HostEnv) => (r.domain && r.local_part ? `${r.local_part}@${r.domain}` : `${r.host_slug}@mail.${h.neutralDomain}`);

/** The bare address client email currently goes out from (the domains settings page shows it). */
export async function clientFromAddress(db: Conn, agencyId: string, h: HostEnv): Promise<string> {
  return clientAddress(await loadSenderRow(db, agencyId), h);
}

/**
 * P14: client audience From = `"<fromName>" <address>`, Reply-To = branding `fromEmail` when set (callers fall back to
 * `replyToFor`). Agency audience = `platformSender`, no Reply-To. Callers pass the service db (client roles cannot read
 * `agency_sending_domain`).
 */
export async function senderFor(db: Conn, agencyId: string, audience: Audience, cfg: SenderConfig): Promise<{ from: string; replyTo?: string }> {
  if (audience === 'agency') return { from: platformSender(cfg) };
  const r = await loadSenderRow(db, agencyId);
  const b = resolveBranding(r.name, r.branding);
  return { from: `${quoteName(b.fromName)} <${clientAddress(r, cfg.hostEnv)}>`, ...(b.fromEmail ? { replyTo: b.fromEmail } : {}) };
}
