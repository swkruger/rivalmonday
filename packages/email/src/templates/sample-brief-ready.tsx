/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { SampleBriefReadyProps } from '../types';
import { formatBillingDate } from './billing-notice';

/** Phase 17a (copy is binding, owner signs). Platform-branded: the requester's agency is not on Rival Monday yet. */
export const sampleBriefReadySubject = (p: Pick<SampleBriefReadyProps, 'businessName'>) => `Your sample brief for ${p.businessName} is ready`;

export function SampleBriefReadyEmail(p: SampleBriefReadyProps) {
  const subject = sampleBriefReadySubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{`Hi ${p.contactName}, here is the sample starting-point brief we built for ${p.businessName} from public information.`}</Text>
      <Button href={p.url} style={button(p.branding)}>
        Open the sample brief
      </Button>
      <Text>
        {`Every statement in it links to the evidence it came from. This is what a client gets in their first week, sent under your agency's name and branding. The link works until ${formatBillingDate(p.expiresAt)}. Questions, or ready to start? Just reply to this email.`}
      </Text>
    </Layout>
  );
}
