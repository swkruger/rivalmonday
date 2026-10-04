// Fixture for email-runtime.test.ts: renders a real @cs/email template through
// whatever loader executes this file (tsx in production, tsx in the test below).
// Prints the HTML to stdout so the spawning test can assert on it.
import { renderEmail, resolveBranding } from '@cs/email';

const branding = resolveBranding('Acme Agency', null);
const { html } = await renderEmail({
  template: 'agency_notice',
  props: {
    branding,
    recipientName: 'Jo',
    clientName: 'Acme Client',
    notice: 'brief_ready',
    title: 'Your brief is ready',
    lines: ['line one'],
    link: 'https://example.com',
    actionLabel: 'View brief',
  },
});

process.stdout.write(html);
