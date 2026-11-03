/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from '../rx';
import { Layout } from '../layout';
import type { LeadDeclinedProps } from '../types';
import { AgencyContactBlock } from './agency-contact';

/** Phase 11c Task 30 (copy is binding, spec §5/§9). Agency-branded, platform-free. */
export const leadDeclinedSubject = (p: Pick<LeadDeclinedProps, 'businessName'>) => `About your request, ${p.businessName}`;

export const leadDeclinedBody = (p: Pick<LeadDeclinedProps, 'agencyName'>) =>
  `Thanks for your interest. ${p.agencyName} isn't able to take on new clients in your area right now.`;

export function LeadDeclinedEmail(p: LeadDeclinedProps) {
  const subject = leadDeclinedSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{`This is ${p.agencyName}, replying to your request for competitor reports for ${p.businessName}.`}</Text>
      <Text>{leadDeclinedBody(p)}</Text>
      <Text>You don't need to do anything.</Text>
      <AgencyContactBlock branding={p.branding} />
    </Layout>
  );
}
