import type { PriceNowView } from '@cs/tools';
import { formatMoney } from '@/lib/format';

const money = (n: number) => formatMoney(n);

/** Decision 2: `$89`, `$89.50`, `from $79`, `up to $1,200`, `$95/hour`. */
export function formatPrice(p: Pick<PriceNowView, 'amount' | 'unit' | 'qualifier'>): string {
  const per = p.unit.startsWith('USD/') ? `/${p.unit.slice(4)}` : '';
  const base = `${money(p.amount)}${per}`;
  return p.qualifier === 'from' ? `from ${base}` : p.qualifier === 'up_to' ? `up to ${base}` : base;
}

/** The change pill against 90 days ago; a cut is `down`. */
export function formatChange(c: { before: number; after: number } | null): { text: string; tone: 'up' | 'down' } | null {
  if (!c) return null;
  const d = c.after - c.before;
  return { text: `${d < 0 ? '▼' : '▲'} ${money(Math.abs(d))}`, tone: d < 0 ? 'down' : 'up' };
}

/** The pricing URL for a selection; the default 90-day period is left out. */
export function pricingHref(clientId: string, q: { competitor?: string; service?: string; days?: number }): string {
  const p = new URLSearchParams();
  if (q.competitor) p.set('competitor', q.competitor);
  if (q.service) p.set('service', q.service);
  if (q.days && q.days !== 90) p.set('days', String(q.days));
  const s = p.toString();
  return `/c/${clientId}/pricing${s ? `?${s}` : ''}`;
}
