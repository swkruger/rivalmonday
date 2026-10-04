import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { button, greeting, Layout, panel } from '../layout';
import type { DigestEmailProps } from '../types';

export function DigestEmail(p: DigestEmailProps) {
  return (
    <Layout branding={p.branding} title={digestSubject(p)} preview={p.alerts.map((a) => a.headline).join(' · ')} footer={`Daily alert digest for ${p.clientName} · ${p.date}`}>
      <Text>{greeting(p.recipientName)}</Text>
      <Text>Here are today's other competitor alerts.</Text>
      {p.alerts.map((a, i) => (
        <Section key={i} style={panel(p.branding)} className="card">
          <Heading as="h3" style={{ fontSize: 16, margin: '0 0 6px' }}>{a.headline}</Heading>
          <Text style={{ margin: '0 0 6px' }}>{a.body}</Text>
          <Link href={a.link}>See the evidence</Link>
        </Section>
      ))}
      <Button href={p.link} style={button(p.branding)}>Open all alerts</Button>
    </Layout>
  );
}
export const digestSubject = (p: DigestEmailProps) => `${p.alerts.length} more competitor alert${p.alerts.length === 1 ? '' : 's'} for ${p.clientName}`;
