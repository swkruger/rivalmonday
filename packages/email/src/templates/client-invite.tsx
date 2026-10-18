/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { ClientInviteProps } from '../types';

/** Phase 11b Task 18 (copy is binding, spec §6). Agency-branded and platform-free: no "Rival Monday" anywhere. */
export const clientInviteSubject = (p: Pick<ClientInviteProps, 'agencyName'>) => `${p.agencyName} invited you to see your competitors`;

export const clientInviteBody = (p: Pick<ClientInviteProps, 'agencyName' | 'businessName'>) =>
  `${p.agencyName} is setting up weekly competitor reports for ${p.businessName}. Sign in to see who you're up against and what they're changing.`;

export function ClientInviteEmail(p: ClientInviteProps) {
  const subject = clientInviteSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Invitation from ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{clientInviteBody(p)}</Text>
      <Button href={p.startUrl} style={button(p.branding)}>
        Get started
      </Button>
    </Layout>
  );
}
