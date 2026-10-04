/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from 'react-email';
import { button, greeting, Layout, panel } from '../layout';
import type { BriefEmailProps } from '../types';
import { TrendTable } from './trend-table';

const LEVEL = { L: 'low', M: 'medium', H: 'high' } as const;

/** Items arrive already filtered to active ones and sorted by ord (the caller's job — Task 15); no upsell field exists. */
export function BriefEmail(p: BriefEmailProps & { variant?: 'email' | 'document' }) {
  const doc = p.variant === 'document';
  return (
    <Layout branding={p.branding} variant={p.variant} title={briefSubject(p)} preview={p.summary} footer={`Weekly competitor brief for ${p.clientName} · ${p.deliveryDate}`}>
      {doc ? null : <Text>{greeting(p.recipientName)}</Text>}
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.kind === 'quiet' ? 'A quiet week' : 'This week'}</Heading>
      <Text>{p.summary}</Text>
      {p.items.map((it, i) => (
        <Section key={i} style={panel(p.branding)} className="card">
          <Heading as="h3" style={{ fontSize: 16, margin: '0 0 6px' }}>{`${i + 1}. ${it.headline}`}</Heading>
          <Text style={{ margin: '0 0 6px' }}><strong>What changed:</strong> {it.whatChanged}</Text>
          {it.whyItMatters ? <Text style={{ margin: '0 0 6px' }}><strong>Why it matters:</strong> {it.whyItMatters}</Text> : null}
          {it.recommendedAction ? <Text style={{ margin: '0 0 6px' }}><strong>What to do:</strong> {it.recommendedAction}</Text> : null}
          <Text style={{ margin: 0, fontSize: 12, color: '#5B6B7F' }}>{`${it.competitorName} · effort ${LEVEL[it.effort]} · impact ${LEVEL[it.impact]}`}</Text>
          {it.link && !doc ? <Link href={it.link}>See the evidence</Link> : null}
        </Section>
      ))}
      {p.trend ? <TrendTable branding={p.branding} windowDays={p.trend.windowDays} businesses={p.trend.businesses} /> : null}
      {p.signOff ? <Text style={{ marginTop: 16 }}>{p.signOff}</Text> : null}
      {p.link && !doc ? <Button href={p.link} style={button(p.branding)}>Open in your dashboard</Button> : null}
      {p.pdfLink && !doc ? <Text><Link href={p.pdfLink}>Download as PDF</Link></Text> : null}
    </Layout>
  );
}
export const briefSubject = (p: BriefEmailProps) => `Weekly competitor brief for ${p.clientName} — ${p.kind === 'quiet' ? 'quiet week' : p.deliveryDate}`;
