/**
 * The public roadmap. Everything here is planned work, not a shipped feature: it never goes in the claims ledger, and every
 * section keeps the "planned, may change" framing. Source: docs/research/2026-10-29-act-on-recommendations-proposal.md.
 */
export const ROADMAP = {
  eyebrow: 'Roadmap',
  h1: 'Coming in version 2.0: act on a recommendation without leaving Rival Monday',
  lead: 'Today every brief tells your client what a rival did and what to do about it. Version 2.0 turns that advice into work your team can draft, approve and publish from the same screen, then shows when the gap to rivals closes.',
  status: 'Planned · Version 2.0',
  notice: 'Planned, not yet available. What it includes and when it ships may change before release.',
  loop: {
    heading: 'How an action will work',
    label:
      'The action loop: a recommendation is drafted, approved and published, then verified on the public profile, measured against rivals and reported in the weekly brief, and repeated while the gap is still open.',
    steps: [
      { id: 'recommendation', name: 'Recommendation', short: 'Gap + evidence', body: 'A gap to rivals, backed by evidence, such as replying to fewer reviews than nearby competitors.' },
      { id: 'draft', name: 'Draft', short: 'Friday prepares it', body: "Friday drafts the reply, profile edit or post from the evidence and your client's runbook." },
      { id: 'approve', name: 'Approve', short: 'A person says yes', body: 'Your team or the business owner edits and approves it. Nothing is posted until a person says yes.' },
      { id: 'publish', name: 'Publish', short: 'Google, or copy and open', body: 'One click once the Google profile is connected, or copy the approved text and open the right Google page.' },
      { id: 'verify', name: 'Verify', short: 'Seen on the public profile', body: 'We check the public profile. An action counts as done only when the change shows up, with a snapshot as proof.' },
      { id: 'measure', name: 'Measure the gap', short: 'You vs the rival median', body: "We track the number behind the recommendation against the median of your client's rivals." },
      { id: 'brief', name: 'Weekly brief', short: 'What you did, with proof', body: 'The Monday brief reports what was done, with before and after evidence.' },
    ],
    loopBack: 'Gap still open: next action',
    checked: 'Checked daily',
  },
  covers: {
    heading: 'What it will cover',
    items: [
      { name: 'Review replies', body: "Drafted replies to unanswered reviews in the business's own voice, with extra care for dental practices, which must never confirm who is a patient." },
      { name: 'Google Business Profile updates', body: 'Suggested categories, services, hours and descriptions, based on what the top rivals show. Name, address and phone number are never changed.' },
      { name: 'Google posts', body: "Draft posts that answer a rival's promotion without starting a price war." },
      { name: 'Listings and citations', body: 'A check of the directories that matter for each trade, showing where your client is missing or out of date compared with rivals.' },
      { name: 'Review requests', body: 'A review link, a QR code and message templates that ask every customer, as Google requires.' },
    ],
  },
} as const;
