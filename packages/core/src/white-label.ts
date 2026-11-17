/** The one white-label rule (13a2 Task 11): client-facing text or markup never names Rival Monday. Agency-audience text and the Friday mascot are exempt (Q9). */
export const PLATFORM_BRAND_RE = /rival[\s-]*monday|rivalmonday/i;

/** Reasons a client-facing text/markup leaks the platform: the name, the wordmark half, the radar mark, an RM icon link. Empty = clean. */
export function brandLeaks(text: string): string[] {
  const out: string[] = [];
  if (PLATFORM_BRAND_RE.test(text)) out.push('platform name');
  if (text.includes('data-part="monday"')) out.push('wordmark half (data-part="monday")');
  if (text.includes('data-slot="radar-mark"')) out.push('radar mark (data-slot="radar-mark")');
  if (/\/brand\//.test(text)) out.push('RM icon link (/brand/)');
  return out;
}
