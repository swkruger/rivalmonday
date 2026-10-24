/**
 * "Contains a figure or date" (7c1 R13): one tokeniser shared by the grounding guard (an uncited sentence with a figure
 * is removed) and the evals' Ask B2 check, so the two cannot drift. A figure is a standalone digit run or a `%`:
 * digits inside citation markers, ids, or words like "A1" / tags like "CANARY-A1-1" are not figures, and neither is a
 * leading list marker ("1.", "**2.**"). Dates are covered by their digits ("Oct 22", "2026-10-22", "10/22").
 */
const MARKERS = /\[(?:ev|app|kb):[^\]]*\]/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LIST_MARKER = /^[\s*_>-]*\d+[.)](?=\s|\*|_|$)/;
const FIGURE = /(?<![A-Za-z\-_])\d|%/;

export function hasFigure(text: string): boolean {
  const plain = text.replace(MARKERS, ' ').replace(UUID, ' ').replace(LIST_MARKER, ' ');
  return FIGURE.test(plain);
}
