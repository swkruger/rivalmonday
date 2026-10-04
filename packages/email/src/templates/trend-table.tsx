/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Column, Row, Section, Text } from 'react-email';
import type { TrendBusiness } from '@cs/db';
import type { Branding } from '../branding';

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));
const cell = { fontSize: 13, margin: 0, padding: '4px 6px' };

/** Deterministic numbers from stored data (spec §9.1.5): reviews, rating then → now, active ads. */
export function TrendTable(props: { branding: Branding; windowDays: number; businesses: TrendBusiness[] }) {
  return (
    <Section style={{ backgroundColor: props.branding.panel, borderRadius: 8, padding: 12 }}>
      <Text style={{ ...cell, fontWeight: 700 }}>Last {props.windowDays} days</Text>
      <Row>
        <Column><Text style={{ ...cell, fontWeight: 600 }}>Business</Text></Column>
        <Column><Text style={{ ...cell, fontWeight: 600 }}>New reviews</Text></Column>
        <Column><Text style={{ ...cell, fontWeight: 600 }}>Rating</Text></Column>
        <Column><Text style={{ ...cell, fontWeight: 600 }}>Active ads</Text></Column>
      </Row>
      {props.businesses.map((b) => (
        <Row key={b.competitorId}>
          <Column><Text style={cell}>{b.self ? `${b.name} (you)` : b.name}</Text></Column>
          <Column><Text style={cell}>{b.reviews}</Text></Column>
          <Column><Text style={cell}>{`${fmt(b.prevAvgRating)} → ${fmt(b.avgRating)}`}</Text></Column>
          <Column><Text style={cell}>{b.activeAds === null ? '—' : b.activeAds}</Text></Column>
        </Row>
      ))}
    </Section>
  );
}
