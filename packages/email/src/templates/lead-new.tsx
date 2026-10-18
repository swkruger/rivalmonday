/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout, panel } from '../layout';
import type { LeadNewProps } from '../types';

/** Phase 11c Task 30 (spec §9): the agency notice (agency branding) and, with Rival Monday branding, the pool notice for platform operators. */
export const leadNewSubject = (p: Pick<LeadNewProps, 'businessName'>) => `New lead: ${p.businessName}`;

export function LeadNewEmail(p: LeadNewProps) {
  const subject = leadNewSubject(p);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Notice from ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <div style={panel(p.branding)}>
        <Text style={{ margin: '0 0 4px' }}>{`Business: ${p.businessName}`}</Text>
        <Text style={{ margin: '0 0 4px' }}>{`Contact: ${p.contactName} (${p.contactEmail}${p.contactPhone ? `, ${p.contactPhone}` : ''})`}</Text>
        {p.ref ? <Text style={{ margin: 0 }}>{`Ref: ${p.ref}`}</Text> : null}
      </div>
      <Button href={p.leadsUrl} style={button(p.branding)}>
        {p.pool ? 'Open the lead pool' : 'Review the lead'}
      </Button>
    </Layout>
  );
}
