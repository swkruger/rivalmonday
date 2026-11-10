import { PRICING } from './pricing';

const price = `$${PRICING.business.monthlyUsd}`;

/** The local-business page `/business`: wording is deck § 4 (docs/superpowers/specs/2026-11-10-site-audiences-copy.md). Prices come from `PRICING.business`. */
export const BUSINESS: {
  hero: {
    eyebrow: string;
    headline: { lead: string; mark: string };
    sub: string;
    primaryCta: string;
    secondaryCta: string;
    finePrint: string;
    finePrintTrial: string;
    proof: readonly string[];
  };
  rivalStory: { heading: string; intro: string; closing: string };
  whatYouGet: { eyebrow: string; heading: string; body: string; note: string };
  close: { heading: string; body: string; bodyTrial: string; button: string };
} = {
  hero: {
    eyebrow: 'Competitor tracking for local businesses',
    headline: { lead: 'Your competitors are making moves. Are you', mark: 'watching?' },
    sub: 'Every Monday you get a short brief on what the businesses near you changed: map rankings, reviews and ads, with the evidence one click away.',
    primaryCta: 'Join the waitlist',
    secondaryCta: 'See a sample brief',
    finePrint: `Free during the pilot · Then ${price}/mo · Set up for you by a local agency`,
    finePrintTrial: `${price}/mo is a typical price · Set up for you by a local agency`,
    proof: ['Public information only', 'No claim without evidence', 'Run for you by an agency'],
  },
  rivalStory: {
    heading: 'While you were busy running the business, a rival took the map.',
    intro: 'Northwind Heating & Air is a made-up business. What happened to it is the kind of thing we see every week.',
    closing: "You won't catch this between jobs. A monthly rankings report won't either.",
  },
  whatYouGet: {
    eyebrow: 'What you get',
    heading: 'What you open on Monday morning.',
    body: 'Your competitors on one page, a short brief in your inbox every Monday, and an assistant to answer your questions. Every number links back to the evidence it came from.',
    note: 'The Monday brief and alerts are always included. Your agency decides whether you also get the dashboard and the assistant.',
  },
  close: {
    heading: 'Want this for your business?',
    body: "Join the waitlist and we'll email you when we can start watching your competitors. A local agency sets it up and runs it for you. Free during the pilot.",
    bodyTrial: "Join the waitlist and we'll email you when we can start watching your competitors. A local agency sets it up and runs it for you.",
    button: 'Join the waitlist',
  },
};

/** Section ids on `/business`, in page order. */
export const BUSINESS_ANCHORS = ['rival-story', 'client-view', 'sample', 'join'] as const;
