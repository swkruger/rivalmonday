/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { ClientBillingNoticeProps } from '../types';

/** Phase 9b Task 8 (copy is binding). Agency-branded and platform-free: no "Rival Monday" anywhere (f13). */
export const clientBillingNoticeSubject = (p: Pick<ClientBillingNoticeProps, 'kind' | 'agencyName'>) =>
  p.kind === 'client-payment-link' ? `${p.agencyName} has set up billing for your competitor reports` : 'Payment needed for your competitor reports';

export const clientBillingNoticeBody = (p: Pick<ClientBillingNoticeProps, 'kind' | 'agencyName'>) =>
  p.kind === 'client-payment-link'
    ? `${p.agencyName} now bills your competitor reports through a secure payment page. It takes about a minute.`
    : "We couldn't process your latest payment. Please update your payment method to keep your reports running.";

export function ClientBillingNoticeEmail(p: ClientBillingNoticeProps) {
  const subject = clientBillingNoticeSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Billing notice from ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{clientBillingNoticeBody(p)}</Text>
      <Button href={p.actionUrl} style={button(p.branding)}>
        {p.kind === 'client-payment-link' ? 'Set up payment' : 'Update payment'}
      </Button>
    </Layout>
  );
}
