// Draft copy: owner signs. Every entry is checked against the claims ledger
// (docs/research/2026-10-29-phase-17c-claim-check.md, rows int-<slug>) and the vendor-logo ledger
// (docs/research/2026-10-29-phase-17c-vendor-logos.md). No logo renders until the owner flips `approved`
// there and adds the file; until then the site shows a plain text name.
export type BrandVerdict = 'logo-ok' | 'text-only' | 'drop' | 'unchecked';

export interface Integration {
  slug: 'openrouter' | 'anthropic' | 'neon' | 'vercel' | 'railway' | 'cloudflare' | 'postmark' | 'stripe' | 'sentry';
  name: string;
  role: 'AI' | 'Database' | 'Hosting' | 'Storage & security' | 'Email' | 'Billing' | 'Monitoring';
  oneLine: string;
  whatItIs: string;
  howWeUseIt: string[];
  forYourAgency: string[];
  vendorUrl: `https://${string}`;
  /** Mirrors the vendor-logo ledger row: `approved` = the owner checked the guideline and added the file. */
  brand: { guidelineUrl: string | null; verdict: BrandVerdict; approved: boolean };
  /** Feeds collectionPage(). */
  seo: { title: string; description: string; crumb: string };
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    slug: 'openrouter',
    name: 'OpenRouter',
    role: 'AI',
    oneLine: 'Routes our AI calls.',
    whatItIs: 'A gateway that gives one connection to many AI models, so we can pick the right model for each job.',
    howWeUseIt: [
      'Writing the weekly briefs and answering questions in Friday.',
      'Turning text into searchable form, and running the checks that decide whether a claim is kept.',
      'Zero data retention is requested for our calls.',
    ],
    forYourAgency: [
      'The models can change over time without changing how you use Rival Monday.',
      'Every claim a brief makes still links back to its evidence.',
    ],
    vendorUrl: 'https://openrouter.ai',
    brand: { guidelineUrl: 'https://openrouter.ai/brand', verdict: 'logo-ok', approved: false },
    seo: {
      title: 'OpenRouter integration',
      description: 'How Rival Monday uses OpenRouter to route its AI calls, and what that means for your agency.',
      crumb: 'OpenRouter',
    },
  },
  {
    slug: 'anthropic',
    name: 'Anthropic',
    role: 'AI',
    oneLine: 'Claude models for writing and topic work.',
    whatItIs: 'The company behind the Claude family of AI models.',
    howWeUseIt: [
      'Claude models write the briefs and answer Friday (through OpenRouter).',
      "Background topic work can use Anthropic's batch API.",
    ],
    forYourAgency: [
      'Claude is one of the model families behind your briefs. Other services in this list handle other AI jobs.',
    ],
    vendorUrl: 'https://www.anthropic.com',
    brand: { guidelineUrl: 'https://www.anthropic.com/legal/trademark-guidelines', verdict: 'text-only', approved: false },
    seo: {
      title: 'Anthropic integration',
      description: 'How Rival Monday uses Claude models from Anthropic for briefs, Friday and topic work.',
      crumb: 'Anthropic',
    },
  },
  {
    slug: 'neon',
    name: 'Neon',
    role: 'Database',
    oneLine: 'Our Postgres database.',
    whatItIs: 'A hosted Postgres database service.',
    howWeUseIt: ['Holds every agency, client, brief and alert.', 'Row-level security walls off each agency.'],
    forYourAgency: ['Your agency sees only its own clients and data.'],
    vendorUrl: 'https://neon.com',
    brand: { guidelineUrl: 'https://neon.com/brand', verdict: 'logo-ok', approved: false },
    seo: {
      title: 'Neon integration',
      description: 'How Rival Monday uses Neon Postgres, with row-level security separating each agency.',
      crumb: 'Neon',
    },
  },
  {
    slug: 'vercel',
    name: 'Vercel',
    role: 'Hosting',
    oneLine: 'Hosts the app and this site.',
    whatItIs: 'A hosting platform for web applications.',
    howWeUseIt: ['Hosts the app, its API, the MCP endpoint and this website.'],
    forYourAgency: ['The dashboard, Friday and the MCP connection are served from the same place.'],
    vendorUrl: 'https://vercel.com',
    brand: { guidelineUrl: 'https://vercel.com/geist/brands', verdict: 'text-only', approved: false },
    seo: {
      title: 'Vercel integration',
      description: 'How Rival Monday uses Vercel to host the app, its API, the MCP endpoint and this site.',
      crumb: 'Vercel',
    },
  },
  {
    slug: 'railway',
    name: 'Railway',
    role: 'Hosting',
    oneLine: 'Runs the background worker.',
    whatItIs: 'A platform for running always-on services.',
    howWeUseIt: ['Runs the worker that collects public information and runs the weekly schedules.'],
    forYourAgency: ['Collection and briefs run in the background, so your team does not have to start them.'],
    vendorUrl: 'https://railway.com',
    brand: { guidelineUrl: null, verdict: 'unchecked', approved: false },
    seo: {
      title: 'Railway integration',
      description: 'How Rival Monday uses Railway to run the worker that collects public information each week.',
      crumb: 'Railway',
    },
  },
  {
    slug: 'cloudflare',
    name: 'Cloudflare',
    role: 'Storage & security',
    oneLine: 'Evidence storage and bot protection.',
    whatItIs: 'A network and security company. We use two of its services: R2 storage and Turnstile.',
    howWeUseIt: ['R2 stores every snapshot behind a claim.', 'Turnstile keeps bots off public forms.'],
    forYourAgency: ['Evidence stays available, so you can open the source behind any claim.'],
    vendorUrl: 'https://www.cloudflare.com',
    brand: { guidelineUrl: 'https://www.cloudflare.com/trademark/', verdict: 'text-only', approved: false },
    seo: {
      title: 'Cloudflare integration',
      description: 'How Rival Monday uses Cloudflare R2 for evidence storage and Turnstile on public forms.',
      crumb: 'Cloudflare',
    },
  },
  {
    slug: 'postmark',
    name: 'Postmark',
    role: 'Email',
    oneLine: 'Sends briefs, alerts and invites.',
    whatItIs: 'A service for sending transactional email.',
    howWeUseIt: [
      'Delivers briefs, alerts, invitations and sign-in emails.',
      'Reports bounces back to us so a bad address is noticed.',
    ],
    forYourAgency: ['Briefs and alerts reach your clients by email, and a hard bounce is flagged to your agency.'],
    vendorUrl: 'https://postmarkapp.com',
    brand: { guidelineUrl: null, verdict: 'unchecked', approved: false },
    seo: {
      title: 'Postmark integration',
      description: 'How Rival Monday uses Postmark to send briefs, alerts, invites and sign-in email.',
      crumb: 'Postmark',
    },
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    role: 'Billing',
    oneLine: 'Billing for agencies and their clients.',
    whatItIs: 'A payments and billing service.',
    howWeUseIt: [
      'Bills agencies for Rival Monday through Stripe Billing.',
      'Lets agencies bill their own clients through Stripe Connect.',
    ],
    // "No platform fee" holds only while connect_application_fee_percent = 0 (global and per agency). Owner checks /platform/billing.
    forYourAgency: [
      'Your clients pay you directly through your own Stripe account (Stripe Connect). We add no platform fee.',
    ],
    vendorUrl: 'https://stripe.com',
    brand: { guidelineUrl: 'https://stripe.com/newsroom/brand-assets', verdict: 'text-only', approved: false },
    seo: {
      title: 'Stripe integration',
      description: 'How Rival Monday uses Stripe for agency billing and Stripe Connect for client payments.',
      crumb: 'Stripe',
    },
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    role: 'Monitoring',
    oneLine: 'Error monitoring.',
    whatItIs: 'An error-tracking service.',
    howWeUseIt: [
      'Tells us when the app, the worker or this site hits an error.',
      'Email addresses are masked, and cookies, IP addresses and request bodies are dropped before a report is sent.',
    ],
    forYourAgency: ['We hear about problems early, before anyone writes in.'],
    vendorUrl: 'https://sentry.io',
    brand: { guidelineUrl: null, verdict: 'unchecked', approved: false },
    seo: {
      title: 'Sentry integration',
      description: 'How Rival Monday uses Sentry to catch errors in the app, the worker and this site.',
      crumb: 'Sentry',
    },
  },
];

export const listedIntegrations = (): Integration[] => INTEGRATIONS.filter((i) => i.brand.verdict !== 'drop');

export const INTEGRATIONS_PAGE = {
  eyebrow: 'Integrations',
  h1: 'What Rival Monday runs on',
  lead: 'The services Rival Monday runs on, and what each one does for your agency.',
  disclaimer: "Listing a service doesn't mean it endorses Rival Monday. Names are trademarks of their owners.",
};
