/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { AgencyClientBillingNoticeProps } from '../types';

/** Phase 9b Task 8 (copy is binding). Rival Monday branded: the platform tells the agency about one of its clients' payments. */
export const agencyClientBillingNoticeSubject = (p: Pick<AgencyClientBillingNoticeProps, 'kind' | 'clientName' | 'n' | 'until'>) => {
  switch (p.kind) {
    case 'client-payment-failed':
      return `${p.clientName}'s payment failed`;
    case 'client-paid':
      return `${p.clientName} is now paying`;
    case 'client-auto-paused':
      return `${p.clientName} was paused after ${p.n ?? ''} days without payment`;
    case 'client_spend_paused':
      return `${p.clientName}: AI work paused until ${p.until ?? ''}`;
  }
};

export const agencyClientBillingNoticeBody = (p: Pick<AgencyClientBillingNoticeProps, 'kind' | 'clientName' | 'until'>) => {
  switch (p.kind) {
    case 'client-payment-failed':
      return `We couldn't process ${p.clientName}'s latest payment. They have been asked to update their payment method.`;
    case 'client-paid':
      return `${p.clientName} completed payment, and their reports are now billed through your connected account.`;
    case 'client-auto-paused':
      return `${p.clientName}'s monitoring and briefs are paused until payment is sorted out.`;
    case 'client_spend_paused':
      return `AI work for ${p.clientName} is paused until ${p.until ?? ''} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.`;
  }
};

export function AgencyClientBillingNoticeEmail(p: AgencyClientBillingNoticeProps) {
  const subject = agencyClientBillingNoticeSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer="Client billing notice">
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{agencyClientBillingNoticeBody(p)}</Text>
      <Button href={p.billingUrl} style={button(p.branding)}>
        {p.kind === 'client_spend_paused' ? 'Open usage' : 'Open client billing'}
      </Button>
    </Layout>
  );
}
