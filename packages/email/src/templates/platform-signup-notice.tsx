/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { PlatformSignupNoticeProps } from '../types';
import { formatBillingDate } from './billing-notice';

/** Phase 10 Task 11 (copy is binding). Sent to the platform owner, Rival Monday branded. */
export const platformSignupNoticeSubject = (p: Pick<PlatformSignupNoticeProps, 'agencyName'>) => `New agency sign-up: ${p.agencyName}`;

export function PlatformSignupNoticeEmail(p: PlatformSignupNoticeProps) {
  const subject = platformSignupNoticeSubject(p);
  const offer = p.offer === 'pilot' ? `Pilot${p.pilotEndsAt ? ` until ${formatBillingDate(p.pilotEndsAt)}` : ''}` : 'Trial';
  return (
    <Layout branding={p.branding} title={subject} preview={subject}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text style={{ margin: '0 0 8px' }}>{p.contactName?.trim() ? `Contact: ${p.contactName.trim()} <${p.email}>` : `Contact: ${p.email}`}</Text>
      <Text style={{ margin: '0 0 8px' }}>{`Source: ${p.source === 'invite' ? 'Invite link' : 'Open sign-up'}`}</Text>
      <Text style={{ margin: '0 0 8px' }}>{`Offer: ${offer}`}</Text>
      <Button href={p.consoleUrl} style={button(p.branding)}>
        Open in console
      </Button>
    </Layout>
  );
}
