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

/**
 * A dollar amount followed by these words is a discount, rebate, credit, deposit, or a coupon/voucher/gift-card
 * face value — not the price of a service. "off" right after the amount is a discount whether written with a
 * space ("$50 off") or a hyphen ("$50-off"); "off-peak", "off-season", and "off-hours" are time qualifiers, not
 * discounts, so they are deliberately excluded (the amount stays a price — see "distinguishes off-peak from off discount").
 */
const DISCOUNT_AFTER =
  /^\s*(?:(?:instant|mail-in|trade-in|cash|utility|manufacturer'?s?|federal|tax|bonus)\s+)?(?:-?off\b(?![- ](?:peak|season|hours?)\b)|discount|rebate|credit|savings?\b|back\b|down\b|deposit|coupon\b|voucher\b|gift\s*card\b|instant\s+savings\b)/i;
/** A price named as the old one ("was $129", "reg. $150", "originally $90") is superseded, not observed. */
const SUPERSEDED_BEFORE = /\b(?:was|reg(?:ular(?:ly)?)?\.?|regular\s+price|originally|normally|retail(?:\s+price)?|list\s+price)\s*:?\s*$/i;
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
  // Collect all candidate prices first (excluding discounts and max-price violations)
  const candidates: Array<{
    observation: PriceObservation;
    isSuperseded: boolean;
  }> = [];
  for (const f of extractNumericFacts(text)) {
    if (f.kind !== 'price' || typeof f.value !== 'number') continue;
    const raw = f.raw.replace(/\s+/g, ' ');
    let at = text.indexOf(f.raw, cursor);
    if (at === -1) at = text.indexOf(f.raw);
    cursor = at + f.raw.length;
    if (f.value > MAX_PRICE) continue;
    const before = text.slice(Math.max(0, at - 40), at).replace(/\s+/g, ' ');
    const after = text.slice(at + f.raw.length, at + f.raw.length + 40).replace(/\s+/g, ' ');
    const c = classifyPrice(before, after);
    if (c.discount) continue;
    const isSuperseded = SUPERSEDED_BEFORE.test(before);
    const key = `${f.value}|${f.unit}|${c.qualifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      observation: { amount: f.value, unit: f.unit, qualifier: c.qualifier, promo, raw, context: f.context },
      isSuperseded,
    });
  }
  // Filter: drop a superseded price only if a later non-superseded price survives
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.isSuperseded) {
      // Check if any later candidate survives (is not superseded and not a discount)
      const hasLaterPrice = candidates.slice(i + 1).some((c) => !c.isSuperseded);
      if (!hasLaterPrice) {
        // No later price, so keep this one even though it's marked superseded
        out.push(candidate.observation);
      }
      // Otherwise skip it (later price exists, so this is truly superseded)
    } else {
      out.push(candidate.observation);
    }
  }
  return out;
}
