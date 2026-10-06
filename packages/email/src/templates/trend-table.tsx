/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { CSSProperties } from 'react';
import { Section, Text } from 'react-email';
import type { TrendBusiness } from '@cs/db';
import type { Branding } from '../branding';

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));
const cell = { fontSize: 13, margin: 0, padding: '4px 6px' };
const th: CSSProperties = { ...cell, fontWeight: 600, verticalAlign: 'bottom' };
const td: CSSProperties = { ...cell, verticalAlign: 'top' };
const num: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };

/**
 * Deterministic numbers from stored data (spec §9.1.5): reviews, rating then → now, active ads.
 * One real table with fixed column widths: react-email's Row renders each row as its own table, which
 * lets every row size its own columns and skews the numbers under a long business name.
 */
export function TrendTable(props: { branding: Branding; windowDays: number; businesses: TrendBusiness[] }) {
  return (
    <Section style={{ backgroundColor: props.branding.panel, borderRadius: 8, padding: 12 }}>
      <Text style={{ ...cell, fontWeight: 700 }}>Last {props.windowDays} days</Text>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '49%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '21%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Business</th>
            <th style={{ ...th, ...num }}>New reviews</th>
            <th style={{ ...th, ...num }}>Rating</th>
            <th style={{ ...th, ...num }}>Active ads</th>
          </tr>
        </thead>
        <tbody>
          {props.businesses.map((b) => (
            <tr key={b.competitorId}>
              <td style={td}>{b.self ? `${b.name} (you)` : b.name}</td>
              <td style={{ ...td, ...num }}>{b.reviews}</td>
              <td style={{ ...td, ...num }}>{`${fmt(b.prevAvgRating)} → ${fmt(b.avgRating)}`}</td>
              <td style={{ ...td, ...num }}>{b.activeAds === null ? '—' : b.activeAds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
