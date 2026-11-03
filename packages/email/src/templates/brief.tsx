/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Link, Section, Text } from '../rx';
import { button, greeting, Layout, panel } from '../layout';
import type { BriefEmailProps } from '../types';
import { AgencyContactBlock } from './agency-contact';
import { FeedbackLine } from './feedback-line';
import { Scorecard } from './scorecard';
import { TrendTable } from './trend-table';

const LEVEL = { L: 'low', M: 'medium', H: 'high' } as const;

/** Email only: who it is from, what it is and what to do. The PDF keeps its own layout. */
const briefIntro = (p: BriefEmailProps) => {
  const agency = p.branding.displayName;
  if (p.kind === 'starting_point') return `This is ${agency} with ${p.clientName}'s starting point: where you stand today against the competitors we now watch. Read it below to see where to focus first. From here on, you'll get a brief from us every week.`;
  if (p.kind === 'quiet') return `This is ${agency} with ${p.clientName}'s weekly competitor brief. There's nothing you need to do this week.`;
  return `This is ${agency} with ${p.clientName}'s weekly competitor brief: what your competitors changed and what we suggest you do about it. Read it below and pick the actions you want to take.`;
};

/** Items arrive already filtered to active ones and sorted by ord (the caller's job — Task 15); no upsell field exists. */
export function BriefEmail(p: BriefEmailProps & { variant?: 'email' | 'document' }) {
  const doc = p.variant === 'document';
  return (
    <Layout branding={p.branding} variant={p.variant} title={briefSubject(p)} preview={p.summary} footer={`${p.kind === 'starting_point' ? 'Your starting point for' : 'Weekly competitor brief for'} ${p.clientName} · ${p.deliveryDate}`}>
      {doc ? null : <Text>{greeting(p.recipientName)}</Text>}
      {doc ? null : <Text>{briefIntro(p)}</Text>}
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.kind === 'quiet' ? 'A quiet week' : p.kind === 'starting_point' ? 'Your starting point' : 'This week'}</Heading>
      <Text>{p.summary}</Text>
      {p.scorecard && p.kind !== 'quiet' ? <Scorecard branding={p.branding} model={p.scorecard} /> : null}
      {p.items.map((it, i) => (
        <Section key={i} style={panel(p.branding)} className="card">
          <Heading as="h3" style={{ fontSize: 16, margin: '0 0 6px' }}>{`${i + 1}. ${it.headline}`}</Heading>
          <Text style={{ margin: '0 0 6px' }}><strong>What changed:</strong> {it.whatChanged}</Text>
          {it.whyItMatters ? <Text style={{ margin: '0 0 6px' }}><strong>Why it matters:</strong> {it.whyItMatters}</Text> : null}
          {it.recommendedAction ? <Text style={{ margin: '0 0 6px' }}><strong>What to do:</strong> {it.recommendedAction}</Text> : null}
          <Text style={{ margin: 0, fontSize: 14, color: '#5B6B7F' }}>{`${it.subject === 'self' ? '' : `${it.competitorName} · `}effort ${LEVEL[it.effort]} · impact ${LEVEL[it.impact]}`}</Text>
          {it.link && !doc ? <Link href={it.link}>See the evidence</Link> : null}
        </Section>
      ))}
      {p.scorecard && p.kind === 'quiet' ? <Scorecard branding={p.branding} model={p.scorecard} heading="Where you stand" /> : null}
      {p.trend ? <TrendTable branding={p.branding} windowDays={p.trend.windowDays} businesses={p.trend.businesses} /> : null}
      {p.signOff ? <Text style={{ marginTop: 16 }}>{p.signOff}</Text> : null}
      {p.link && !doc ? <Button href={p.link} style={button(p.branding)}>Open in your dashboard</Button> : null}
      {p.pdfLink && !doc ? <Text><Link href={p.pdfLink}>Download as PDF</Link></Text> : null}
      {doc ? null : <FeedbackLine feedback={p.feedback} subject={briefSubject(p)} />}
      {doc ? null : <AgencyContactBlock branding={p.branding} />}
    </Layout>
  );
}
/** A starting point (12b decided copy) names the agency's product (its brand display name). */
export const briefSubject = (p: BriefEmailProps) =>
  p.kind === 'starting_point' ? `Your starting point with ${p.branding.displayName}` : `Weekly competitor brief for ${p.clientName} — ${p.kind === 'quiet' ? 'quiet week' : p.deliveryDate}`;
