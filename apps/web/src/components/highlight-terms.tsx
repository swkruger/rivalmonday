import { bannedTermRegex } from '@cs/core';
import { Fragment } from 'react';

/** Ranges of every whole-word match of any term (same matcher as `findBannedTerms`), merged so marks never overlap. */
function ranges(text: string, terms: readonly string[]): [number, number][] {
  const found: [number, number][] = [];
  for (const t of terms) {
    const re = bannedTermRegex(t, 'giu');
    if (!re) continue;
    for (const m of text.matchAll(re)) found.push([m.index, m.index + m[0].length]);
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of found) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Text with each banned-term match wrapped in `<mark>` (whole words, case-insensitive, Unicode letters count as word characters). */
export function HighlightTerms({ text, terms }: { text: string; terms: readonly string[] }) {
  const rs = ranges(text, terms);
  if (rs.length === 0) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  rs.forEach(([from, to], i) => {
    if (from > at) out.push(<Fragment key={`t${i}`}>{text.slice(at, from)}</Fragment>);
    out.push(<mark key={`m${i}`} className="rounded-sm bg-warning-surface px-0.5 text-ink">{text.slice(from, to)}</mark>);
    at = to;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}
