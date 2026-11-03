/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Heading, Text } from '../rx';
import { button, greeting, Layout } from '../layout';
import type { AgencyNoticeProps } from '../types';

/** What this notice means and what the reader should do (the title and lines carry the specifics). */
const NEXT: Record<AgencyNoticeProps['notice'], (client: string) => string> = {
  am_alert: (c) => `A new competitor alert came in for ${c}. Open it to see the details and whether anything is needed from you.`,
  brief_ready: (c) => `${c}'s brief is ready for your review. Check it and approve it so it goes out on time.`,
  brief_failed: (c) => `We couldn't generate ${c}'s brief. Open it to see what happened and what to do next.`,
  brief_overdue: (c) => `${c}'s brief still needs your approval. Review it as soon as you can so the client gets it on time.`,
  setup_suggestions_ready: (c) => `Competitor suggestions for ${c} are ready. Review them and choose which ones to watch so setup can move on.`,
  setup_client_changed: (c) => `${c} changed something in their setup. Open it to check the change works for you.`,
  setup_idle: (c) => `${c}'s setup has stalled and needs the next step from you. Open it to carry on.`,
  rank_scan_skipped: (c) => `This week's local ranking scan for ${c} didn't run. Open rankings to see the latest results and run a new scan if you need one.`,
  contact_bounced: (c) => `An email to a contact at ${c} couldn't be delivered. Check the address and correct it if it's wrong.`,
};

export function AgencyNoticeEmail(p: AgencyNoticeProps) {
  return (
    <Layout branding={p.branding} title={p.title} preview={p.lines[0] ?? p.title} footer={`Agency notice · ${p.clientName}`}>
      <Text>{greeting(p.recipientName)}</Text>
      <Text>{`This is an automatic notice from your ${p.branding.displayName} account. ${NEXT[p.notice](p.clientName)}`}</Text>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 8px' }}>{p.title}</Heading>
      {p.lines.map((l, i) => <Text key={i} style={{ margin: '0 0 8px' }}>{l}</Text>)}
      <Button href={p.link} style={button(p.branding)}>{p.actionLabel}</Button>
    </Layout>
  );
}
