import { PRICING } from '../../../content/pricing';

/** Join popup copy (owner signs). Spec § 5 lines verbatim where given. */
export const JOIN_COPY = {
  step1: {
    eyebrow: 'Step 1 of 2',
    title: 'Join the Rival Monday pilot',
    sub: "Tell us who you are — we'll send you an invite as places open.",
    agency: {
      title: 'I run an agency',
      body: `Resell Rival Monday to your clients under your own brand. Free during the pilot, then $${PRICING.agency.monthlyUsd}/mo incl. ${PRICING.agency.seatsIncluded} client seats.`,
    },
    business: {
      title: 'I own a local business',
      body: `Get a weekly brief on what your competitors are doing. Free during the pilot, then $${PRICING.business.monthlyUsd}/mo.`,
    },
    foot: 'Takes 30 seconds',
    next: 'Continue',
  },
  back: 'Back',
  agency: {
    eyebrow: 'Step 2 of 2 · Agency',
    title: 'About your agency',
    sub: "We'll email you when your pilot place is ready.",
    name: 'Your name',
    email: 'Work email',
    orgName: 'Agency name',
    website: 'Website',
    band: 'Local-business clients',
    bandPlaceholder: 'Select…',
    wantsSample: 'Send me a real sample brief for one of my clients',
    sampleName: 'Client business name',
    sampleWebsite: 'Client website',
    sampleLocation: 'or city / ZIP',
    sampleHint: 'One of the two is enough.',
    submit: 'Join the waitlist',
    fine: 'Protected by Cloudflare Turnstile. We only use this to contact you about the pilot.',
  },
  business: {
    eyebrow: 'Step 2 of 2 · Local business',
    title: 'About your business',
    sub: "We'll email you when we can start watching your competitors.",
    name: 'Your name',
    email: 'Email',
    orgName: 'Business name',
    website: 'Website',
    location: 'or city / ZIP',
    hint: 'One of the two is enough.',
    vertical: 'Type of business',
    verticalPlaceholder: 'Select…',
    other: 'Other…',
    verticalOther: 'Describe your business',
    submit: 'Join the waitlist',
    fine: 'Protected by Cloudflare Turnstile. We only use this to contact you about the pilot.',
  },
  done: {
    title: "You're on the list. We've emailed you a confirmation.",
    // Draft second line (owner signs).
    sub: 'Click the link in that email to confirm your address.',
    close: 'Close',
  },
} as const;
