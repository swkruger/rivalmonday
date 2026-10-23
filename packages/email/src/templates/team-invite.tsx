/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { TeamInviteProps } from '../types';

/** 15c-2a D7 (copy for owner sign-off, spec §6): an agency-role invitation. Agency-branded; never names the platform. */
export const teamInviteSubject = (p: Pick<TeamInviteProps, 'inviterName' | 'agencyName'>) => `${p.inviterName} invited you to ${p.agencyName}`;

export const teamInviteBody = (p: Pick<TeamInviteProps, 'inviterName' | 'agencyName' | 'roleLabel' | 'expiryDate'>) =>
  `${p.inviterName} has invited you to join ${p.agencyName} as ${p.roleLabel}. Sign in with this email address to accept. This invite expires on ${p.expiryDate}.`;

export function TeamInviteEmail(p: TeamInviteProps) {
  const subject = teamInviteSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Invitation from ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{teamInviteBody(p)}</Text>
      <Button href={p.signInUrl} style={button(p.branding)}>
        Sign in
      </Button>
    </Layout>
  );
}
