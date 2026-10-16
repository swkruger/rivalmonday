import { type Db, platformCostService, platformCostSnapshot } from '@cs/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { PlatformRole } from '../../platform';
import { burnRate, daysLeft, serviceStatus, type SnapPoint } from './math';
import type { PlatformCostLowPayload, SnapshotDeps } from './snapshot';
import { type ServiceKey, SERVICES } from './types';

const DAY_MS = 86_400_000;
const num = (v: string | null): number | null => (v == null ? null : Number(v));

/**
 * env list (`PLATFORM_ADMIN_EMAILS`, treated as owners) + active `platform_admin` users with one of `roles`, lower-cased
 * and deduped. Phase 10 (R13): the sign-up notice goes to `['owner', 'staff']`.
 */
export async function platformOperatorEmails(deps: Pick<SnapshotDeps, 'service' | 'platformAdmins'>, roles: readonly PlatformRole[]): Promise<string[]> {
  const rows = roles.length === 0 ? [] : [...(await deps.service.execute<{ email: string }>(sql`
    select u.email from platform_admin pa join auth."user" u on u.id = pa.user_id
    where pa.revoked_at is null and pa.role in (${sql.join(roles.map((r) => sql`${r}`), sql`, `)})`))];
  return [...new Set([...deps.platformAdmins, ...rows.map((r) => r.email)].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** env list + active platform_admin role='owner' users' emails, lower-cased and deduped. */
export const platformOwnerEmails = (deps: Pick<SnapshotDeps, 'service' | 'platformAdmins'>): Promise<string[]> => platformOperatorEmails(deps, ['owner']);

const usd = (n: number) => `$${n.toFixed(2)}`;

/** `skip`: services that were not_configured in this run (no worker credentials): neither set nor clear their alert. */
export async function evaluateAlerts(deps: SnapshotDeps, skip: ReadonlySet<ServiceKey> = new Set()): Promise<{ emailed: ServiceKey[]; cleared: ServiceKey[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const db: Db = deps.service;
  const emailed: ServiceKey[] = [];
  const cleared: ServiceKey[] = [];
  const services = await db.select().from(platformCostService);
  let owners: string[] | null = null;
  for (const cfg of services) {
    if (!cfg.enabled) continue;
    const key = cfg.service as ServiceKey;
    if (skip.has(key)) continue;
    const meta = SERVICES[key];
    const [latestRow] = await db.select().from(platformCostSnapshot).where(eq(platformCostSnapshot.service, key)).orderBy(desc(platformCostSnapshot.takenAt)).limit(1);
    if (!latestRow) continue;
    const recent = await db
      .select()
      .from(platformCostSnapshot)
      .where(and(eq(platformCostSnapshot.service, key), gte(platformCostSnapshot.takenAt, new Date(now.getTime() - 14 * DAY_MS))));
    const toPoint = (r: typeof latestRow): SnapPoint => ({ takenAt: r.takenAt, status: r.status, amountUsd: num(r.amountUsd), capUsd: num(r.capUsd) });
    const latest = toPoint(latestRow);
    const rate = meta.kind === 'balance' ? burnRate(recent.map(toPoint), now) : null;
    const status = serviceStatus({
      enabled: true, configured: true, kind: meta.kind, latest, lowThresholdUsd: num(cfg.lowThresholdUsd), warnDays: cfg.warnDays, rate,
    });
    if (status === 'ok') {
      if (cfg.alertedAt) {
        await db.update(platformCostService).set({ alertedAt: null }).where(eq(platformCostService.service, key));
        cleared.push(key);
      }
      continue;
    }
    if (status !== 'low' || cfg.alertedAt) continue;

    const remaining = meta.kind === 'balance' ? latest.amountUsd : latest.capUsd != null && latest.amountUsd != null ? latest.capUsd - latest.amountUsd : null;
    let amountText: string;
    if (meta.kind === 'usage') amountText = `${usd(remaining ?? 0)} of ${usd(latest.capUsd ?? 0)} plan cap`;
    else amountText = usd(latest.amountUsd ?? 0); // a balance service can only be Low with a dollar amount (credit services need a unit rate first)
    const payload: PlatformCostLowPayload = {
      label: meta.label,
      amountText,
      daysLeft: meta.kind === 'balance' && remaining != null ? daysLeft(remaining, rate) : null,
      billingUrl: cfg.billingUrl,
      costsUrl: `${deps.appUrl.replace(/\/+$/, '')}/platform/costs`,
    };
    owners ??= await platformOwnerEmails(deps);
    for (const to of owners) {
      try {
        await deps.sendLowEmail(to, payload);
      } catch {
        // eslint-disable-next-line no-console -- best-effort: the service only, never the address or amount
        console.error(`[platform-costs] email failed for ${key}`);
      }
    }
    // Set even when some sends failed: one bad address must not cause a daily re-send storm.
    await db.update(platformCostService).set({ alertedAt: now }).where(eq(platformCostService.service, key));
    emailed.push(key);
  }
  return { emailed, cleared };
}
