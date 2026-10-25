/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from 'react-email';
import { greeting, Layout } from '../layout';
import type { AgencyHoldProps } from '../types';

export const agencyHoldSubject = (kind: 'started' | 'lifted', agency: string) =>
  kind === 'started' ? `Your ${agency} account is on hold` : `Your ${agency} account is active again`;

/**
 * Phase 15c-3a spec §4.4 (copy is decided): the platform tells an agency's admins its account was put on hold or the
 * hold was lifted. Always Rival Monday branded. Never carries the operator's hold reason.
 */
export function AgencyHoldEmail(p: AgencyHoldProps) {
  const subject = agencyHoldSubject(p.kind, p.agencyName);
  return (
    <Layout branding={p.branding} title={subject} preview={subject}>
      <Text>{greeting(p.recipientName)}</Text>
      {p.kind === 'started' ? (
        <>
          <Text>
            Your {p.agencyName} account is on hold. Your team can still sign in and see everything, but changes and scheduled work are paused, and so is billing.
          </Text>
          <Text>To restore it, reply to this email or contact {p.supportEmail}.</Text>
        </>
      ) : (
        <Text>
          The hold on your {p.agencyName} account has been lifted. Your team can make changes again, and scheduled work and billing resume today.
        </Text>
      )}
    </Layout>
  );
}
