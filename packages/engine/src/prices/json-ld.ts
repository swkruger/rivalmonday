import { type StructuredOffer, sha256Hex } from '@cs/collectors';
import { MAX_PRICE, PROMO, type PriceObservation } from './observe';

/** Name/description words that make an offer a discount, never a price (spec D5). */
const DISCOUNT_WORDS = /\b(?:off|discounts?|rebates?|coupons?|credits?|savings?)\b/i;
const PLAIN_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

function amountOf(v: string | number | null): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && PLAIN_NUMBER.test(v.trim()) ? Number(v.trim().replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_PRICE ? n : null;
}

const dollars = (n: number) => {
  const [int, frac] = (Number.isInteger(n) ? String(n) : n.toFixed(2)).split('.');
  return `$${int!.replace(/\B(?=(\d{3})+$)/g, ',')}${frac ? `.${frac}` : ''}`;
};

/**
 * Spec D5: JSON-LD Offer / AggregateOffer nodes → pseudo-blocks for the price stage. `Offer.price` is exact,
 * `AggregateOffer.lowPrice` is "from". USD only (a missing currency counts as USD); offers with a
 * `priceSpecification`, discount wording, or an unparseable / out-of-range amount are skipped. Rules only.
 */
export function offerPrices(offers: StructuredOffer[]): { text: string; sha: string; obs: PriceObservation[] }[] {
  const out: { text: string; sha: string; obs: PriceObservation[] }[] = [];
  const seen = new Set<string>();
  for (const o of offers) {
    if (o.hasPriceSpecification) continue;
    if (o.currency !== null && o.currency.trim().toUpperCase() !== 'USD') continue;
    const label = [o.name, o.description].filter((s): s is string => s !== null).join(' ');
    if (DISCOUNT_WORDS.test(label)) continue;
    const amount = amountOf(o.type === 'AggregateOffer' ? o.lowPrice : o.price);
    if (amount === null) continue;
    const qualifier = o.type === 'AggregateOffer' ? 'from' : 'exact';
    const raw = qualifier === 'from' ? `from ${dollars(amount)}` : dollars(amount);
    const text = o.name ? `${o.name} — ${raw}` : raw;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, sha: sha256Hex(`jsonld|${text}`), obs: [{ amount, unit: 'USD', qualifier, promo: PROMO.test(label), raw, context: text }] });
  }
  return out;
}
