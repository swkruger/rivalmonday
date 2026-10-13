import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

describe('support_session_started email', () => {
  it('renders the binding subject and body copy, Rival Monday branded', async () => {
    const out = await renderEmail({
      template: 'support_session_started',
      props: { branding: resolveBranding('Rival Monday', null), recipientName: 'Ann', platformAdminName: 'Pat Platform', date: 'October 13, 2026', reason: 'Checking the brief setup' },
    });
    expect(out.subject).toBe('Rival Monday support opened a read-only session');
    expect(out.text).toContain("Pat Platform opened a read-only session on October 13, 2026. Reason: Checking the brief setup. They can't change anything. Questions? Reply to this email.");
    expect(out.html).toContain('#2A6BAC');
  });
});
