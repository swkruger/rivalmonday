/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from 'react-email';
import { button, greeting, Layout, panel } from '../layout';
import type { TrendReportEmailProps } from '../types';
import { TrendTable } from './trend-table';

const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function TrendReportEmail(p: TrendReportEmailProps & { variant?: 'email' | 'document' }) {
  const d = p.data;
  const doc = p.variant === 'document';
  const r = d.recommendations;
  return (
    <Layout branding={p.branding} variant={p.variant} title={trendReportSubject(p)} preview={`Your competitor trends for ${p.quarter}`} footer={`Quarterly trend report for ${p.clientName} · ${p.quarter}`}>
      {doc ? null : <Text>{greeting(p.recipientName)}</Text>}
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{`Competitor trends, ${p.quarter}`}</Heading>
      <TrendTable branding={p.branding} windowDays={d.windowDays} businesses={d.businesses} />
      <Section style={panel(p.branding)} className="card">
        <Heading as="h3" style={{ fontSize: 16, margin: '0 0 6px' }}>Competitor changes we tracked</Heading>
        {Object.entries(d.eventsByType).sort((a, b) => b[1] - a[1]).map(([type, n]) => <Text key={type} style={{ margin: 0 }}>{`${type}: ${n}`}</Text>)}
      </Section>
      {d.moves.length > 0 ? (
        <Section style={panel(p.branding)} className="card">
          <Heading as="h3" style={{ fontSize: 16, margin: '0 0 6px' }}>Patterns we detected</Heading>
          {d.moves.map((m, i) => <Text key={i} style={{ margin: 0 }}>{`${label(m.moveType)} — ${m.competitorName} (first seen ${m.firstDetectedAt}, ${m.status})`}</Text>)}
        </Section>
      ) : null}
      <Section style={panel(p.branding)} className="card">
        <Text style={{ margin: 0 }}>{`Weekly briefs sent: ${d.briefsSent} · Alerts delivered: ${d.alertsDelivered}`}</Text>
        <Text style={{ margin: 0 }}>{`Recommendations: ${r.created} new, ${r.done} done, ${r.inProgress} in progress, ${r.dismissed} dismissed`}</Text>
      </Section>
      {p.link && !doc ? <Button href={p.link} style={button(p.branding)}>Open in your dashboard</Button> : null}
      {p.pdfLink && !doc ? <Text><Link href={p.pdfLink}>Download as PDF</Link></Text> : null}
    </Layout>
  );
}
export const trendReportSubject = (p: TrendReportEmailProps) => `${p.clientName}: competitor trends for ${p.quarter}`;
