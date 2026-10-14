import { type Db, platformCostService, platformCostSnapshot } from '@cs/db';
import { anthropicAdapter } from './adapters/anthropic';
import { apifyAdapter } from './adapters/apify';
import { dataforseoAdapter } from './adapters/dataforseo';
import { neonAdapter } from './adapters/neon';
import { openrouterAdapter } from './adapters/openrouter';
import { scrapecreatorsAdapter } from './adapters/scrapecreators';
import { evaluateAlerts } from './alerts';
import { type CostAdapter, type CostEnv, type CostReading, type ServiceKey, SERVICES } from './types';

export const ADAPTERS: Record<ServiceKey, CostAdapter> = {
  openrouter: openrouterAdapter,
  dataforseo: dataforseoAdapter,
  scrapecreators: scrapecreatorsAdapter,
  apify: apifyAdapter,
  anthropic: anthropicAdapter,
  neon: neonAdapter,
};

/** The payload of the low-balance email (branding is added by the sender; this is always Rival Monday). */
export interface PlatformCostLowPayload {
  label: string;
  amountText: string;
  daysLeft: number | null;
  billingUrl: string | null;
  costsUrl: string;
}

export interface SnapshotDeps {
  service: Db;
  env: CostEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  platformAdmins: string[];
  sendLowEmail: (to: string, p: PlatformCostLowPayload) => Promise<void>;
  appUrl: string;
  /** Test seam: replaces individual adapters. */
  adapters?: Partial<Record<ServiceKey, CostAdapter>>;
}

export type SnapshotStatuses = Record<ServiceKey, CostReading['status'] | 'disabled'>;

/** numeric columns are text in drizzle: write numbers rounded to 4 dp. */
export const to4dp = (n: number): string => (Math.round(n * 10_000) / 10_000).toFixed(4);

const KEYS = Object.keys(SERVICES) as ServiceKey[];

export async function snapshotAll(deps: SnapshotDeps): Promise<{ written: number; statuses: SnapshotStatuses }> {
  const now = (deps.now ?? (() => new Date()))();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const configRows = await deps.service.select().from(platformCostService);
  const byKey = new Map(configRows.map((r) => [r.service as ServiceKey, r]));
  const statuses = {} as SnapshotStatuses;
  const active: ServiceKey[] = [];
  for (const key of KEYS) {
    const cfg = byKey.get(key);
    if (cfg && !cfg.enabled) statuses[key] = 'disabled';
    else active.push(key);
  }
  const settled = await Promise.allSettled(active.map((key) => (deps.adapters?.[key] ?? ADAPTERS[key])(deps.env, fetchImpl, now)));
  let written = 0;
  for (const [i, key] of active.entries()) {
    const s = settled[i]!;
    const reading: CostReading = s.status === 'fulfilled' ? s.value : { status: 'error', kind: SERVICES[key].kind, error: 'internal' };
    statuses[key] = reading.status;
    if (reading.status === 'not_configured') continue;
    const rate = byKey.get(key)?.unitRateUsd;
    let amount = reading.amountUsd ?? null;
    if ((key === 'scrapecreators' || key === 'neon') && reading.units != null && rate != null && reading.status === 'ok') {
      amount = reading.units * Number(rate);
    }
    await deps.service.insert(platformCostSnapshot).values({
      service: key,
      takenAt: now,
      status: reading.status,
      kind: SERVICES[key].kind,
      amountUsd: amount != null ? to4dp(amount) : null,
      units: reading.units != null ? to4dp(reading.units) : null,
      capUsd: reading.capUsd != null ? to4dp(reading.capUsd) : null,
      error: reading.error ? reading.error.slice(0, 120) : null,
    });
    written++;
  }
  await evaluateAlerts(deps, new Set(KEYS.filter((k) => statuses[k] === 'not_configured')));
  return { written, statuses };
}
