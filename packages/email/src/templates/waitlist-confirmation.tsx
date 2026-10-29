/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { WaitlistConfirmationProps } from '../types';

/** Phase 17a (copy is binding, owner signs). Always platform-branded: waitlist visitors have no agency yet. */
export const waitlistConfirmationSubject = (p: Pick<WaitlistConfirmationProps, 'kind'>) =>
  p.kind === 'agency' ? 'Confirm your place in the Rival Monday pilot' : 'Confirm your email for Rival Monday';

export function WaitlistConfirmationEmail(p: WaitlistConfirmationProps) {
  const subject = waitlistConfirmationSubject(p);
  const agency = p.kind === 'agency';
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>
        {agency
          ? `Hi ${p.contactName}, thanks for asking to join the Rival Monday pilot for ${p.orgName}. Please confirm this is your email address so we can send your invite.`
          : `Hi ${p.contactName}, thanks for your interest in weekly competitor briefs for ${p.orgName}. Please confirm this is your email address.`}
      </Text>
      <Button href={p.confirmUrl} style={button(p.branding)}>
        Confirm my email
      </Button>
      {agency && p.sampleBusinessName ? (
        <Text>
          {`You also asked for a real sample brief for ${p.sampleBusinessName}. Once you've confirmed, we'll build it from public information and email you a link when it's ready.`}
        </Text>
      ) : null}
      <Text>
        {agency
          ? "We open places a few at a time and will email you when yours is ready. The link works for 7 days. If you didn't ask for this, ignore this email and nothing happens."
          : "During the pilot we work through local marketing agencies. Once you've confirmed, we'll introduce you to one that serves businesses like yours, and they'll be in touch. The link works for 7 days. If you didn't ask for this, ignore this email."}
      </Text>
    </Layout>
  );
}
