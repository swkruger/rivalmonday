/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { AgencyWelcomeProps } from '../types';

/** Phase 10 Task 11 (copy is binding). Rival Monday branded. */
export const agencyWelcomeSubject = () => 'Welcome to Rival Monday';

export function AgencyWelcomeEmail(p: AgencyWelcomeProps) {
  const subject = agencyWelcomeSubject();
  return (
    <Layout branding={p.branding} title={subject} preview={subject}>
      <Text>{`${p.agencyName} is set up. Next: tell us about your agency, invite your team and add your first client. It takes about 10 minutes, and you can stop anytime.`}</Text>
      <Button href={p.url} style={button(p.branding)}>
        Continue setup
      </Button>
    </Layout>
  );
}
