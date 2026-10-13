/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from 'react-email';
import { greeting, Layout } from '../layout';
import type { SupportSessionStartedProps } from '../types';

export const supportSessionStartedSubject = () => 'Rival Monday support opened a read-only session';

/** Phase 8b spec § Email (copy is binding). Always Rival Monday branded: it is the platform, not the agency, writing. */
export function SupportSessionStartedEmail(p: SupportSessionStartedProps) {
  return (
    <Layout branding={p.branding} title={supportSessionStartedSubject()} preview={supportSessionStartedSubject()} footer="Platform access notice">
      <Text>{greeting(p.recipientName)}</Text>
      <Text>
        {p.platformAdminName} opened a read-only session on {p.date}. Reason: {p.reason}. They can't change anything. Questions? Reply to this email.
      </Text>
    </Layout>
  );
}
