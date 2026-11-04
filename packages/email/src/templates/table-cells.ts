import type { CSSProperties } from 'react';

/**
 * Shared cell styles for the brief's data tables (scorecard, trend table). Data 16 px, header labels 14 px.
 * Headers wrap inside their own cell (fixed table layout + normal white-space + break-word, which Gmail, Outlook
 * and Apple Mail all honour); every cell keeps 8 px either side so right-aligned numbers never touch the next column.
 */
const base: CSSProperties = { margin: 0, padding: '6px 8px', whiteSpace: 'normal' };
// Header labels wrap only at spaces (never mid-word on a phone); data cells (business names) may break a long word.
export const th: CSSProperties = { ...base, wordWrap: 'normal', overflowWrap: 'normal', fontSize: 14, lineHeight: '20px', fontWeight: 600, verticalAlign: 'bottom' };
export const td: CSSProperties = { ...base, wordWrap: 'break-word', overflowWrap: 'break-word', fontSize: 16, lineHeight: '22px', verticalAlign: 'top' };
export const num: CSSProperties = { textAlign: 'right' };
/** Numeric data cell: right-aligned and never split mid-number on a narrow phone column. */
export const numCell: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', wordWrap: 'normal', overflowWrap: 'normal' };
