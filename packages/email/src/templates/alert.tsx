import { Button, Heading, Text } from 'react-email';
import { button, greeting, Layout } from '../layout';
import type { AlertEmailProps } from '../types';

export function AlertEmail(p: AlertEmailProps) {
  return (
    <Layout branding={p.branding} title={p.headline} preview={p.body} footer={`Competitor alert for ${p.clientName} · detected ${p.detectedOn}`}>
      <Text>{greeting(p.recipientName)}</Text>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.headline}</Heading>
      <Text>{p.body}</Text>
      <Button href={p.link} style={button(p.branding)}>See the evidence</Button>
    </Layout>
  );
}
export const alertSubject = (p: AlertEmailProps) => p.headline;
