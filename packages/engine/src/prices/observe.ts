import type { PriceQualifier } from '@cs/db';
import { extractNumericFacts } from '../facts/numeric';

/** Larger amounts are commercial projects or typos, not local-service prices. */
export const MAX_PRICE = 100_000;

export interface PriceObservation {
  amount: number;
  unit: string;
  qualifier: PriceQualifier;
  /** The block presents the price as an offer. */
  promo: boolean;
  raw: string;
  context: string;
}

/** A dollar amount followed by these words is a discount, rebate, credit or deposit — not the price of a service. */
const DISCOUNT_AFTER = /^\s*(?:(?:instant|mail-in|trade-in|cash|utility|manufacturer'?s?|federal|tax|bonus)\s+)?(?:off\b(?!-)|discount|rebate|credit|savings?\b|back\b|down\b|deposit)/i;
const DISCOUNT_BEFORE = /\b(?:save|saving|savings of)(?:\s+up\s+to)?\s*$/i;
const FROM_BEFORE = /\b(?:from|starting(?:\s+at)?|starts\s+at|as\s+low\s+as)\s*$/i;
const UP_TO_BEFORE = /\bup\s+to\s*$/i;
const PROMO = /\b(?:special|sale|promo(?:tion)?|coupon|discount|limited[- ]time|deal|offer|save)\b/i;

/** Reads the words before and after a price: is it a discount amount, and is it "from", "up to" or exact? */
export function classifyPrice(before: string, after: string): { discount: boolean; qualifier: PriceQualifier } {
  return {
    discount: DISCOUNT_AFTER.test(after) || DISCOUNT_BEFORE.test(before),
    qualifier: FROM_BEFORE.test(before) ? 'from' : UP_TO_BEFORE.test(before) ? 'up_to' : 'exact',
  };
}

/** Spec §6.6 observed prices of one web block (rules only, decision 9). */
export function pricesInBlock(text: string): PriceObservation[] {
  const promo = PROMO.test(text);
  const seen = new Set<string>();
  const out: PriceObservation[] = [];
  let cursor = 0;
  for (const f of extractNumericFacts(text)) {
    if (f.kind !== 'price' || typeof f.value !== 'number' || f.value > MAX_PRICE) continue;
    const raw = f.raw.replace(/\s+/g, ' ');
    let at = text.indexOf(f.raw, cursor);
    if (at === -1) at = text.indexOf(f.raw);
    const before = text.slice(Math.max(0, at - 40), at).replace(/\s+/g, ' ');
    const after = text.slice(at + f.raw.length, at + f.raw.length + 40).replace(/\s+/g, ' ');
    const c = classifyPrice(before, after);
    if (c.discount) continue;
    cursor = at + f.raw.length;
    const key = `${f.value}|${f.unit}|${c.qualifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ amount: f.value, unit: f.unit, qualifier: c.qualifier, promo, raw, context: f.context });
  }
  return out;
}
