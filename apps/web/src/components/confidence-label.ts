/**
 * Brief items at or above this confidence get the amber left border; the label says the same in words so colour is
 * never the only signal. The code has no other confidence band (no medium/low), so none is invented here.
 * source: apps/web/src/components/views/brief-view.tsx:BriefView and apps/web/src/app/(app)/agency/approvals/[briefId]/review-controls.tsx:ReviewItem (`confidence >= 0.85`)
 */
export const HIGH_CONFIDENCE = 0.85;

export function confidenceLabel(confidence: number): { high: boolean; text: string } {
  const pct = Math.round(confidence * 100);
  const high = confidence >= HIGH_CONFIDENCE;
  return { high, text: `${high ? 'High confidence' : 'Confidence'} ${pct}%` };
}
