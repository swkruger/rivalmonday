/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { LeadVerifyProps } from '../types';
import { AgencyContactBlock } from './agency-contact';

/** Phase 11c Task 30 (copy is binding, spec §9). Agency-branded when the lead belongs to an agency link, else platform-branded. */
export const leadVerifySubject = () => 'Confirm your email to see your competitor snapshot';

export const leadVerifyBody = (p: Pick<LeadVerifyProps, 'businessName'>) =>
  `Click below to confirm your email and see how ${p.businessName} compares with nearby businesses.`;

export function LeadVerifyEmail(p: LeadVerifyProps) {
  const subject = leadVerifySubject();
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{`You're getting this from ${p.branding.displayName} because a competitor snapshot was requested for ${p.businessName} using this email address.`}</Text>
      <Text>{leadVerifyBody(p)}</Text>
      <Button href={p.verifyUrl} style={button(p.branding)}>
        See my snapshot
      </Button>
      <Text>If you didn't ask for this, you can ignore this email.</Text>
      <AgencyContactBlock branding={p.branding} />
    </Layout>
  );
}
