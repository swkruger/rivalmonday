import { PRICING } from '../../../content/pricing';

/** Join popup copy (owner signs). Spec § 5 lines verbatim where given. */
export const JOIN_COPY = {
  step1: {
    eyebrow: 'Step 1 of 2',
    title: 'Join the Rival Monday pilot',
    sub: "Tell us who you are — we'll send you an invite as places open.",
    // Pilot off (NEW, owner signs): `*Trial` variants.
    titleTrial: 'Get started with Rival Monday',
    subTrial: 'Agencies can start a free trial now. Local businesses join the waitlist.',
    agency: {
      title: 'I run an agency',
      body: `Resell Rival Monday to your clients under your own brand. Free during the pilot, then $${PRICING.agency.monthlyUsd}/mo incl. ${PRICING.agency.seatsIncluded} client seats.`,
      bodyTrial: `Resell Rival Monday to your clients under your own brand. ${PRICING.agency.trialDays}-day free trial, then $${PRICING.agency.monthlyUsd}/mo incl. ${PRICING.agency.seatsIncluded} client seats.`,
    },
    business: {
      title: 'I own a local business',
      body: `Get a weekly brief on what your competitors are doing. Free during the pilot, then $${PRICING.business.monthlyUsd}/mo.`,
      bodyTrial: `Get a weekly brief on what your competitors are doing, for $${PRICING.business.monthlyUsd}/mo. Join the waitlist and we'll email you when we can start.`,
    },
    foot: 'Takes 30 seconds',
    next: 'Continue',
  },
  back: 'Back',
  // Draft (owner signs).
  submitFailed: 'Something went wrong. Please try again.',
  // Task 8 submit outcomes (owner signs).
  stillChecking: 'Still checking, try again in a moment.',
  check: "The check didn't go through. Please try it again.",
  invalid: 'Please check the details above.',
  unavailable: "We couldn't send this just now. Please try again in a minute, or email support@rivalmonday.app.",
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
    // Pilot off (NEW, owner signs).
    fineTrial: 'Protected by Cloudflare Turnstile. We only use this to contact you about the waitlist.',
  },
  done: {
    title: "You're on the list. We've emailed you a confirmation.",
    // Draft second line (owner signs).
    sub: 'Click the link in that email to confirm your address.',
    close: 'Close',
  },
} as const;
