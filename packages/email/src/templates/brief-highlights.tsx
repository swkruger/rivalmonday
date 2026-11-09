/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { GRADE_LABEL } from '@cs/core';
import { Text } from '../rx';
import type { BriefHighlights } from '../types';

export const statLine = (t: BriefHighlights['totals']) => `${t.major} Major · ${t.notable} Notable · ${t.minor} Minor changes`;
export const attachmentLine = (attached: boolean) => (attached ? 'Your full report is attached (PDF).' : 'Your full report is ready to download as a PDF.');
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One-line rows, no tables or charts: phone-safe. Placed after the Major item cards. */
export function HighlightLines({ h }: { h: BriefHighlights }) {
  return (
    <>
      {h.lines.map((l, i) => <Text key={i} style={{ margin: '0 0 6px' }}>{`${GRADE_LABEL[l.grade]}: ${l.text} (${l.dates})`}</Text>)}
      {h.moreLines > 0 ? <Text style={{ margin: '0 0 6px', color: '#5B6B7F' }}>{`+ ${plural(h.moreLines, 'more notable change')}`}</Text> : null}
      {h.minor > 0 ? <Text style={{ margin: '0 0 6px', color: '#5B6B7F' }}>{`+ ${plural(h.minor, 'minor change')}`}</Text> : null}
    </>
  );
}
