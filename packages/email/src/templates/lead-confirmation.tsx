/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from 'react-email';
import { Layout, panel } from '../layout';
import type { LeadConfirmationProps } from '../types';

/** Phase 11c Task 30 (copy is binding, spec §9). The preview facts and summary are inline: raw view tokens are never stored, so there is no preview link. */
export const leadConfirmationSubject = (p: Pick<LeadConfirmationProps, 'businessName'>) => `Your competitor snapshot for ${p.businessName}`;

export const leadConfirmationClosing = (p: Pick<LeadConfirmationProps, 'agencyName'>) =>
  p.agencyName ? `${p.agencyName} will be in touch within one business day.` : "We'll match you with a local marketing partner and they'll be in touch.";

export const leadConfirmationFailed = (p: Pick<LeadConfirmationProps, 'agencyName'>) =>
  `We couldn't build your snapshot, but ${p.agencyName ?? 'we'} ${p.agencyName ? 'has' : 'have'} your details.`;

export function LeadConfirmationEmail(p: LeadConfirmationProps) {
  const subject = leadConfirmationSubject(p);
  const ready = p.preview.status === 'ready' ? p.preview : null;
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      {ready ? (
        <>
          <div style={panel(p.branding)}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {ready.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
          {ready.summary ? <Text>{ready.summary}</Text> : null}
        </>
      ) : p.preview.status === 'failed' ? (
        <Text>{leadConfirmationFailed(p)}</Text>
      ) : null}
      <Text>{leadConfirmationClosing(p)}</Text>
    </Layout>
  );
}
