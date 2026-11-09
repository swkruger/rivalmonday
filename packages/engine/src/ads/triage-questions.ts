import type { DecisionQuestion, DecisionResult } from '@cs/ai';
import type { VerticalPack } from '@cs/verticals';
import { buildPriceQuestions } from '../prices/price-stage';
import { serviceQuestionKey } from '../tag/questions';

/** Model task of the triage call (ai.yaml; Jev, escalates to the image LLM). */
export const AD_IMAGE_DECISION_TASK = 'ad_image_decisions';

export const IMAGE_THEMES = {
  price_promo: 'A price or promotion',
  seasonal: 'Seasonal or weather-related',
  emergency: 'Emergency or same-day service',
  financing: 'Financing or payment plans',
  trust: 'Trust: reviews, awards, guarantees or years in business',
  new_service: 'A new service or product',
  event: 'An event',
  hiring: 'Hiring',
  brand: 'General brand awareness',
  other: 'Something else',
} as const;
export type ImageTheme = keyof typeof IMAGE_THEMES;

/** D3: one call per image — three Nouls, one service Choice per vertical, one theme Choice. */
export function buildImageTriageQuestions(packs: VerticalPack[]): Record<string, DecisionQuestion> {
  const price = buildPriceQuestions(packs);
  const q: Record<string, DecisionQuestion> = {
    shows_person: {
      type: 'noul',
      instructions: 'The image shows a real person: a face, a body or a body part in a photo. Drawings, cartoons, logos and mascots are not people.',
    },
    shows_price: {
      type: 'noul',
      instructions: 'The image shows a money amount as the price of a service, such as "$89" or "from $49". A percentage, the word "free", or a discount amount alone (such as "$50 off") is not a price.',
    },
    shows_offer: {
      type: 'noul',
      instructions: 'The image shows an offer: a discount, coupon, rebate, free add-on, financing, or a limited-time deal.',
    },
  };
  for (const p of packs) {
    const key = serviceQuestionKey(p.id);
    const base = price[key];
    if (base?.type !== 'choice') continue;
    q[key] = { type: 'choice', instructions: `Which ${p.name} service does this ad image promote? Answer "none" if it is not one specific service.`, options: base.options };
  }
  q.theme = { type: 'choice', instructions: 'What is the main theme of this ad image?', options: { ...IMAGE_THEMES } };
  return q;
}

export interface ImageTriage {
  showsPerson: boolean;
  showsPrice: boolean | null;
  showsOffer: boolean | null;
  serviceIds: Record<string, string | null> | null;
  theme: string | null;
  confidences: Record<string, number>;
}

/**
 * R8: `shows_person` true or below τ (or missing) ⇒ person, and then only `showsPerson` is kept. Price/offer below τ
 * ⇒ false; a choice below τ ⇒ null; a service answer of "none" ⇒ null. `confidences` = every answer's confidence.
 */
export function resolveImageTriage(r: DecisionResult<string>, verticalIds: string[]): ImageTriage {
  const low = new Set<string>(r.needsReview);
  const confidences = Object.fromEntries(Object.entries(r.answers).map(([k, a]) => [k, a.confidence]));
  const noul = (k: string): boolean | undefined => {
    const a = r.answers[k];
    return a?.type === 'noul' ? a.value : undefined;
  };
  const pick = (k: string): string | null => {
    const a = r.answers[k];
    return !low.has(k) && a?.type === 'choice' ? a.value : null;
  };
  if (low.has('shows_person') || noul('shows_person') !== false) {
    return { showsPerson: true, showsPrice: null, showsOffer: null, serviceIds: null, theme: null, confidences };
  }
  const theme = pick('theme');
  return {
    showsPerson: false,
    showsPrice: !low.has('shows_price') && noul('shows_price') === true,
    showsOffer: !low.has('shows_offer') && noul('shows_offer') === true,
    serviceIds: Object.fromEntries(verticalIds.map((v) => {
      const s = pick(serviceQuestionKey(v));
      return [v, s && s !== 'none' ? s : null];
    })),
    theme: theme && theme in IMAGE_THEMES ? theme : null,
    confidences,
  };
}
