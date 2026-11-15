/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from '../rx';
import { button, Layout } from '../layout';
import type { AgencyDomainNoticeKind, AgencyDomainNoticeProps } from '../types';

const FAILED_NEXT = 'Check the DNS records on the Domains page and try again.';

/** 13a1 Task 11 (subjects, bodies and action label are decided copy). Rival Monday branded: the platform writes to agency admins. */
const COPY: Record<AgencyDomainNoticeKind, { subject: (name: string) => string; body: (name: string, error: string | undefined) => string }> = {
  domain_live: { subject: (n) => `Your domain ${n} is live`, body: (n) => `Client links now use ${n}.` },
  domain_failed: { subject: (n) => `We couldn't verify ${n}`, body: (_n, e) => (e ? `${e} ${FAILED_NEXT}` : FAILED_NEXT) },
  sender_verified: { subject: (n) => `Email from ${n} is ready`, body: (n) => `Client emails now come from ${n}.` },
  sender_failed: { subject: (n) => `We couldn't verify email for ${n}`, body: (_n, e) => (e ? `${e} ${FAILED_NEXT}` : FAILED_NEXT) },
};

export const agencyDomainNoticeSubject = (p: Pick<AgencyDomainNoticeProps, 'kind' | 'name'>) => COPY[p.kind].subject(p.name);

export function AgencyDomainNoticeEmail(p: AgencyDomainNoticeProps) {
  const subject = agencyDomainNoticeSubject(p);
  const about = p.kind.startsWith('domain') ? `your web address ${p.name}` : `email sending from ${p.name}`;
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer="Domain notice">
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>{`This is Rival Monday with an update about ${about}.`}</Text>
      <Text>{COPY[p.kind].body(p.name, p.error)}</Text>
      <Button href={p.settingsUrl} style={button(p.branding)}>
        Open Domains
      </Button>
    </Layout>
  );
}
