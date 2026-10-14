/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { BillingNoticeKind, BillingNoticeProps } from '../types';

/** Phase 9a Task 7 (copy is binding). Always Rival Monday branded: the platform, not the agency, writes about the agency's subscription. */
const COPY: Record<BillingNoticeKind, { subject: string; body: (date: string) => string }> = {
  trial_started: { subject: 'Your Rival Monday trial has started', body: (d) => `Your 30-day trial runs until ${d}. Up to 3 clients are included.` },
  trial_ending_7: { subject: 'Your trial ends in 7 days', body: () => 'Add a payment method to keep your clients monitored without interruption.' },
  trial_ending_1: { subject: 'Your trial ends in 1 day', body: () => 'Add a payment method to keep your clients monitored without interruption.' },
  trial_ended: { subject: 'Your trial has ended', body: (d) => `Add a payment method to keep going. Service pauses on ${d}.` },
  payment_failed: { subject: 'Payment failed', body: (d) => `We couldn't charge your card. Service pauses on ${d} unless payment succeeds.` },
  service_paused: { subject: 'Service is paused', body: () => 'Monitoring, briefs and alerts are paused. Update your payment method to resume.' },
  account_suspended: { subject: 'Your account is suspended', body: () => 'Your data is kept. Update your payment method to restore access.' },
  account_reactivated: { subject: "You're all set", body: () => 'Payment received — everything is running again.' },
  pilot_ending_7: { subject: 'Your pilot ends in 7 days', body: (d) => `After ${d} your agency moves to a 30-day trial.` },
};

export const billingNoticeSubject = (kind: BillingNoticeKind) => COPY[kind].subject;

/** ISO timestamps/dates become "November 13, 2026" (UTC); anything else passes through unchanged. */
export function formatBillingDate(date: string | undefined): string {
  if (!date) return '';
  const d = /^\d{4}-\d{2}-\d{2}(T|$)/.test(date) ? new Date(date) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : date;
}

export const billingNoticeBody = (p: Pick<BillingNoticeProps, 'kind' | 'date'>) => COPY[p.kind].body(formatBillingDate(p.date));

export function BillingNoticeEmail(p: BillingNoticeProps) {
  const subject = billingNoticeSubject(p.kind);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Billing notice for ${p.agencyName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{billingNoticeBody(p)}</Text>
      <Button href={p.billingUrl} style={button(p.branding)}>
        Open billing
      </Button>
    </Layout>
  );
}
