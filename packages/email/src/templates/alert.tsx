/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from '../rx';
import { button, greeting, Layout } from '../layout';
import type { AlertEmailProps } from '../types';
import { AgencyContactBlock } from './agency-contact';
import { FeedbackLine } from './feedback-line';

export function AlertEmail(p: AlertEmailProps) {
  return (
    <Layout branding={p.branding} title={p.headline} preview={p.body} footer={`Competitor alert for ${p.clientName} · detected ${p.detectedOn}`}>
      <Text>{greeting(p.recipientName)}</Text>
      <Text>{`This is ${p.branding.displayName}, the team watching ${p.clientName}'s competitors. We spotted a change at ${p.competitorName} that you should know about. Read it below and open the evidence to see the source. You don't need to reply.`}</Text>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.headline}</Heading>
      <Text>{p.body}</Text>
      <Button href={p.link} style={button(p.branding)}>See the evidence</Button>
      <FeedbackLine feedback={p.feedback} subject={alertSubject(p)} />
      <AgencyContactBlock branding={p.branding} />
    </Layout>
  );
}
export const alertSubject = (p: AlertEmailProps) => p.headline;
