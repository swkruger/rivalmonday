/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from 'react-email';
import { button, greeting, Layout } from '../layout';
import type { AgencyNoticeProps } from '../types';

export function AgencyNoticeEmail(p: AgencyNoticeProps) {
  return (
    <Layout branding={p.branding} title={p.title} preview={p.lines[0] ?? p.title} footer={`Agency notice · ${p.clientName}`}>
      <Text>{greeting(p.recipientName)}</Text>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.title}</Heading>
      {p.lines.map((l, i) => <Text key={i} style={{ margin: '0 0 8px' }}>{l}</Text>)}
      <Button href={p.link} style={button(p.branding)}>{p.actionLabel}</Button>
    </Layout>
  );
}
