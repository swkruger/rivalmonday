/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { CSSProperties } from 'react';
import { Section, Text } from 'react-email';
import type { Branding } from '../branding';
import type { ScorecardModel } from '../types';

const cell: CSSProperties = { fontSize: 13, margin: 0, padding: '4px 6px' };
const num: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };
const TREND_COLOUR = { up: '#15803D', down: '#B91C1C' } as const;
const TIER_LABEL = { top: 'Top rival', watch: 'Worth watching', minor: 'Minor' } as const;

/** Four tiles then a compact scorecard table (one real table with fixed widths, like `trend-table.tsx`). Trend colour is always paired with its text. */
export function Scorecard(props: { branding: Branding; model: ScorecardModel; heading?: string }) {
  const { model, branding } = props;
  return (
    <Section>
      {props.heading ? <Text style={{ ...cell, fontWeight: 700, fontSize: 16, padding: '8px 0' }}>{props.heading}</Text> : null}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={6} border={0} style={{ width: '100%', borderCollapse: 'separate' }}>
        <tbody>
          <tr>
            {model.tiles.map((t) => (
              <td key={t.label} style={{ width: '25%', verticalAlign: 'top', backgroundColor: branding.panel, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: '#5B6B7F' }}>{t.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{t.value}</div>
                <div style={{ fontSize: 11, color: '#5B6B7F' }}>{t.sub}</div>
                {t.trendText ? <div style={{ fontSize: 11, fontWeight: 600, color: t.trend ? TREND_COLOUR[t.trend] : '#5B6B7F' }}>{t.trendText}</div> : null}
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
            {model.table.headers.map((h, i) => <th key={h} style={{ ...cell, fontWeight: 600, verticalAlign: 'bottom', ...(i === 0 ? { textAlign: 'left' } : num) }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {model.table.rows.map((r, ri) => (
            <tr key={ri} style={r.self ? { backgroundColor: branding.panel, fontWeight: 700 } : undefined}>
              {r.cells.map((c, i) => (
                <td key={i} style={{ ...cell, verticalAlign: 'top', ...(i === 0 ? {} : num) }}>
                  {c}
                  {i === 0 && r.tier ? <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#5B6B7F' }}>{TIER_LABEL[r.tier]}</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {model.openFirstMoves.length > 0 ? (
        <>
          <Text style={{ ...cell, fontWeight: 700, fontSize: 16, padding: '12px 0 4px' }}>First moves still open</Text>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>{model.openFirstMoves.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      ) : null}
    </Section>
  );
}
