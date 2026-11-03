/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { TIER_LABELS } from '@cs/core';
import type { CSSProperties } from 'react';
import { Section, Text } from '../rx';
import type { Branding } from '../branding';
import type { ScorecardModel } from '../types';
import { num, td, th } from './table-cells';

const label: CSSProperties = { fontSize: 14, lineHeight: '20px', color: '#5B6B7F' };
const TREND_COLOUR = { up: '#15803D', down: '#B91C1C' } as const;

/** Four tiles then a compact scorecard table (one real table with fixed widths, like `trend-table.tsx`). Trend colour is always paired with its text. */
export function Scorecard(props: { branding: Branding; model: ScorecardModel; heading?: string }) {
  const { model, branding } = props;
  return (
    <Section>
      {props.heading ? <Text style={{ margin: 0, fontWeight: 700, padding: '8px 0' }}>{props.heading}</Text> : null}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={6} border={0} style={{ width: '100%', borderCollapse: 'separate' }}>
        <tbody>
          <tr>
            {model.tiles.map((t) => (
              <td key={t.label} style={{ width: '25%', verticalAlign: 'top', backgroundColor: branding.panel, borderRadius: 8, padding: 10 }}>
                <div style={label}>{t.label}</div>
                <div style={{ fontSize: 22, lineHeight: '30px', fontWeight: 800 }}>{t.value}</div>
                <div style={label}>{t.sub}</div>
                {t.trendText ? <div style={{ ...label, fontWeight: 600, color: t.trend ? TREND_COLOUR[t.trend] : '#5B6B7F' }}>{t.trendText}</div> : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <table width="100%" cellPadding={0} cellSpacing={0} border={0} aria-label="Scorecard: you against the rivals we watch" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 8 }}>
        <colgroup>
          <col style={{ width: '28%' }} />
          {model.table.headers.slice(1).map((h) => <col key={h} style={{ width: `${72 / (model.table.headers.length - 1)}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            {model.table.headers.map((h, i) => <th key={h} style={{ ...th, ...(i === 0 ? { textAlign: 'left' } : num) }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {model.table.rows.map((r, ri) => (
            <tr key={ri} style={r.self ? { backgroundColor: branding.panel, fontWeight: 700 } : undefined}>
              {r.cells.map((c, i) => (
                <td key={i} style={{ ...td, ...(i === 0 ? {} : num) }}>
                  {c}
                  {i === 0 && r.tier ? <span style={{ ...label, display: 'block', fontWeight: 400 }}>{TIER_LABELS[r.tier]}</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {model.openFirstMoves.length > 0 ? (
        <>
          <Text style={{ margin: 0, fontWeight: 700, padding: '12px 0 4px' }}>First moves still open</Text>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 16, lineHeight: '24px' }}>{model.openFirstMoves.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      ) : null}
    </Section>
  );
}
