/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { AgencyInviteProps } from '../types';
import { formatBillingDate } from './billing-notice';

/** Phase 10 Task 11 (copy is binding). Rival Monday branded: the platform invites the agency. */
export const agencyInviteSubject = () => "You're invited to Rival Monday";

export function agencyInviteOffer(p: Pick<AgencyInviteProps, 'offer' | 'pilotEndsAt' | 'discountText'>): string {
  if (p.offer === 'pilot') return `You're invited to our pilot${p.pilotEndsAt ? ` until ${formatBillingDate(p.pilotEndsAt)}` : ''}.`;
  return `Your invite includes a 30-day trial${p.discountText ? ` with ${p.discountText}` : ''}.`;
}

export function AgencyInviteEmail(p: AgencyInviteProps) {
  const subject = agencyInviteSubject();
  return (
    <Layout branding={p.branding} title={subject} preview={subject}>
      <Text>
        {`Rival Monday watches your clients' local competitors and sends a weekly brief with evidence for every claim. ${agencyInviteOffer(p)} This link works until ${formatBillingDate(p.expiresAt)}.`}
      </Text>
      <Button href={p.url} style={button(p.branding)}>
        Create your agency
      </Button>
    </Layout>
  );
}
