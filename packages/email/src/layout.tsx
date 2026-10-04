import { Body, Container, Head, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import type { Branding } from './branding';

export const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Print rules for the PDF variant (Task 16): Letter pages, no shadows, keep a card on one page where possible. */
const PRINT_CSS = '@page { size: Letter; margin: 16mm 14mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .card { break-inside: avoid; }';

export function Layout(props: { branding: Branding; title: string; preview: string; variant?: 'email' | 'document'; footer?: string; children: ReactNode }) {
  const b = props.branding;
  const doc = props.variant === 'document';
  return (
    <Html lang="en">
      <Head>
        <title>{props.title}</title>
        {doc ? <style>{PRINT_CSS}</style> : null}
      </Head>
      {doc ? null : <Preview>{props.preview}</Preview>}
      <Body style={{ backgroundColor: doc ? '#FFFFFF' : b.canvas, color: b.ink, fontFamily: FONT, margin: 0 }}>
        <Container style={{ maxWidth: doc ? 760 : 640, margin: '0 auto', padding: '24px 16px' }}>
          <Section style={{ paddingBottom: 16 }}>
            {b.logoUrl ? <Img src={b.logoUrl} alt={b.displayName} height="32" /> : <Text style={{ margin: 0, fontSize: 20, fontWeight: 700, color: b.secondary }}>{b.displayName}</Text>}
          </Section>
          <Section style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: doc ? 0 : 24 }}>{props.children}</Section>
          {props.footer ? <Text style={{ fontSize: 12, color: '#5B6B7F', marginTop: 16 }}>{props.footer}</Text> : null}
        </Container>
      </Body>
    </Html>
  );
}

export const greeting = (name: string | null) => (name ? `Hi ${name.split(' ')[0]},` : 'Hi,');
export const button = (b: Branding) => ({ backgroundColor: b.primary, color: '#FFFFFF', borderRadius: 8, padding: '10px 16px', fontWeight: 600, textDecoration: 'none' });
export const panel = (b: Branding) => ({ backgroundColor: b.panel, borderRadius: 8, padding: 16, marginBottom: 12 });
