/**
 * /how-it-works: the four steps, the claim checks and the questions. Draft: owner signs.
 * Every answer carries the claims-ledger row behind it (docs/research/2026-10-29-phase-17c-claim-check.md; test checks them).
 * Weekly collection has no fixed day, so only Sunday (map scans) and Monday (the brief) are named as days.
 */
import { ANY_INDUSTRY, FAQ_EVIDENCE, FAQ_REVIEW, faqKeywords, faqWatch } from './industries';
import { PRICING_FAQ } from './pricing-page';
import { WEBSITE_MONITORING_LIVE } from './website-monitoring';

/** What gets collected weekly; rivals' web pages join only once website monitoring is on. */
export function weeklyCollection(live: boolean = WEBSITE_MONITORING_LIVE): string {
  return live ? "Reviews, listings, ads, job listings and rivals' key web pages" : 'Reviews, listings, ads and job listings';
}

export const JUMP_LINKS = [
  { label: 'The four steps', href: '#how-it-works' },
  { label: 'How claims get checked', href: '#checks' },
  { label: 'Questions', href: '#faq' },
  { label: 'Guides', href: '#guides' },
] as const;

/** Where the tour, the sample and the board moved to (deck § 7). */
export const HOW_LINKS: readonly { label: string; href: string }[] = [
  { label: 'See what your clients get →', href: '/agencies#client-view' },
  { label: 'Open the sample brief →', href: '/sample-brief' },
  { label: 'See the recommendations board →', href: '/agencies#recommendations' },
];

const faq = (q: string, a: string, ledger: string) => ({ q, a, ledger });
const pricingFaq = (ledger: string) => PRICING_FAQ.find((f) => f.ledger === ledger)!;

export const HOW_FAQ = {
  heading: 'Questions agencies ask',
  groups: [
    {
      title: 'Getting started',
      items: [
        faq('What do I need to add a client?', 'The business and its service area. We find its Google listing, then search the area and suggest the rivals that matter.', 'feat-competitor-discovery'),
        faq('Who picks the rivals?', faqWatch('local').a, 'feat-competitor-discovery'),
        faq('Does it work for any kind of local business?', `Yes. ${ANY_INDUSTRY.body}`, 'ind-any'),
      ],
    },
    {
      title: 'What gets watched',
      items: [
        faq(FAQ_EVIDENCE.q, FAQ_EVIDENCE.a, 'faq-data'),
        faq('How often does it check?', `${weeklyCollection()} are collected weekly. Map rankings run every Sunday, and you can run one extra scan a week with "Scan now". The brief goes out every Monday, and big moves send an alert.`, 'src-local-map-rankings'),
        faq(faqKeywords('emergency plumber', 'dentist near me').q, faqKeywords('emergency plumber', 'dentist near me').a, 'src-local-map-rankings'),
      ],
    },
    {
      title: 'Briefs and claims',
      items: [
        faq(FAQ_REVIEW.q, FAQ_REVIEW.a, 'cap-weeklyBrief'),
        faq('What happens to a claim you cannot back up?', 'It is dropped, not softened. A separate check compares each claim with its evidence before the brief goes out, and every claim that stays links to what it came from.', 'cap-evidenceLinks'),
        faq('What happens with a recommendation?', 'Each one comes from the brief, with its evidence attached. Your client can start it, finish it or dismiss it. A dismissal needs a reason, which helps tune future recommendations.', 'cap-weeklyBrief'),
        faq('Does it post or reply anywhere?', 'No. It reads public information and does not post or reply anywhere. Acting on a recommendation is planned for a later version, and the roadmap has the details.', 'src-google-reviews'),
      ],
    },
    {
      title: 'Your brand and your clients',
      items: [
        faq(pricingFaq('faq-white-label').q, pricingFaq('faq-white-label').a, 'faq-white-label'),
        faq('What is Friday?', 'The in-app assistant. It answers from the same evidence as the brief, with the sources inline, under the name you choose. Your agency switches it on for each client.', 'cap-assistant'),
        faq(pricingFaq('faq-mcp').q, pricingFaq('faq-mcp').a, 'faq-mcp'),
      ],
    },
  ],
} as const;
