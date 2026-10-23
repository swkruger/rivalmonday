/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { PlatformSpendAlertProps } from '../types';

export const platformSpendAlertSubject = (p: Pick<PlatformSpendAlertProps, 'title'>) => p.title;

/** 7b1 (C9): platform staff only, so dollars are allowed. The caller supplies the title and lines. */
export function PlatformSpendAlertEmail(p: PlatformSpendAlertProps) {
  return (
    <Layout branding={p.branding} title={p.title} preview={p.title} footer="Platform spend alert">
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{p.title}</Text>
      {p.lines.map((l) => (
        <Text key={l}>{l}</Text>
      ))}
      <Button href={p.url} style={button(p.branding)}>
        Open usage
      </Button>
    </Layout>
  );
}
