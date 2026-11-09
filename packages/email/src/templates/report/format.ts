import type { ChartSeries } from '@cs/core';
import type { CSSProperties } from 'react';

const UTC_NOON = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** "2026-10-05" → "October 5, 2026" (a date-only value, so read in UTC). */
export const longDate = (ymd: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(UTC_NOON(ymd));

/** "2026-10" → "Oct"; "2026-10-05" → "Oct 5": chart axis labels. */
export const axisLabel = (key: string): string => {
  if (/^\d{4}-\d{2}$/.test(key)) return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(UTC_NOON(`${key}-15`));
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(UTC_NOON(key));
  return key;
};

/** True when at least one series has one known point (a chart of only gaps is no data). */
export const hasPoints = (series: ChartSeries[]): boolean => series.some((s) => s.points.some((v) => v !== null && Number.isFinite(v)));

export const muted = '#5B6B7F';
export const h2: CSSProperties = { fontSize: 20, lineHeight: '28px', fontWeight: 700, margin: '0 0 12px' };
export const h3: CSSProperties = { fontSize: 16, lineHeight: '24px', fontWeight: 700, margin: '16px 0 6px' };
export const small: CSSProperties = { fontSize: 14, lineHeight: '20px', color: muted };
/** Each major section starts a new printed page; short ones (moves, recommendations, alerts) may share one. */
export const pageSection: CSSProperties = { breakBefore: 'page', paddingTop: 4 };
export const keepSection: CSSProperties = { breakInside: 'avoid', paddingTop: 20 };
