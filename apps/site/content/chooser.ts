/** The home page's chooser: wording is deck § 2 (docs/superpowers/specs/2026-11-10-site-audiences-copy.md). */
export const CHOOSER = {
  eyebrow: 'Competitor tracking for local businesses and the agencies that serve them',
  headline: { lead: 'See what local rivals did', mark: 'this week.' },
  sub: 'Rival Monday watches map rankings, reviews and ads around a local business and writes a Monday brief, with the evidence behind every claim.',
  question: 'Which one are you?',
  doors: [
    { id: 'agency', title: 'I run an agency', body: 'Sell it to your clients under your own brand, at your own price.', cta: 'For agencies →', href: '/agencies' },
    { id: 'business', title: 'I own a local business', body: 'Get the Monday brief on your own competitors.', cta: 'For local businesses →', href: '/business' },
  ],
  sample: { lead: 'Not sure yet?', label: 'See a sample brief', href: '/sample-brief' },
  proof: ['Public information only', 'No claim without evidence'],
  bandHeading: 'Which one are you?',
} as const satisfies {
  eyebrow: string;
  headline: { lead: string; mark: string };
  sub: string;
  question: string;
  doors: readonly { id: 'agency' | 'business'; title: string; body: string; cta: string; href: '/agencies' | '/business' }[];
  sample: { lead: string; label: string; href: '/sample-brief' };
  proof: readonly string[];
  bandHeading: string;
};
