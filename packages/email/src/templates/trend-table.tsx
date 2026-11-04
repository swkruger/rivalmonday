/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Section, Text } from '../rx';
import type { TrendBusiness } from '@cs/db';
import type { Branding } from '../branding';
import { num, numCell, td, th } from './table-cells';

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));
const tight = { padding: '6px 4px' } as const;

/**
 * Deterministic numbers from stored data (spec §9.1.5): reviews, rating then → now, active ads.
 * One real table with fixed column widths: react-email's Row renders each row as its own table, which
 * lets every row size its own columns and skews the numbers under a long business name.
 */
export function TrendTable(props: { branding: Branding; windowDays: number; businesses: TrendBusiness[] }) {
  return (
    <Section style={{ backgroundColor: props.branding.panel, borderRadius: 8, padding: 12 }}>
      <Text style={{ margin: 0, padding: '4px 8px', fontWeight: 700 }}>Last {props.windowDays} days</Text>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '36%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '32%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, ...tight, textAlign: 'left' }}>Business</th>
            <th style={{ ...th, ...tight, ...num }}>New reviews</th>
            <th style={{ ...th, ...tight, ...num }}>Rating</th>
            <th style={{ ...th, ...tight, ...num }}>Active ads</th>
          </tr>
        </thead>
        <tbody>
          {props.businesses.map((b) => (
            <tr key={b.competitorId}>
              <td style={{ ...td, padding: '6px 4px' }}>{b.self ? `${b.name} (you)` : b.name}</td>
              <td style={{ ...td, padding: '6px 4px', ...numCell }}>{b.reviews}</td>
              <td style={{ ...td, padding: '6px 4px', ...numCell }}>{`${fmt(b.prevAvgRating)} → ${fmt(b.avgRating)}`}</td>
              <td style={{ ...td, padding: '6px 4px', ...numCell }}>{b.activeAds === null ? '—' : b.activeAds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
