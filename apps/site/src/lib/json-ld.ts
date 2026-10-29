import { SITE_NAME, SITE_URL, TITLE_STEM } from '../../content/site';
import { PRICING } from '../../content/pricing';
import type { Crumb } from './breadcrumbs';

type Ld = Record<string, unknown>;
/** Safe inside <script type="application/ld+json">: no tag break-out, no JS line terminators. */
export function serializeJsonLd(data: Ld | Ld[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function organizationLd(sameAs: readonly string[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL, ...(sameAs.length ? { sameAs: [...sameAs] } : {}) };
}
const monthly = (name: string, usd: number, description: string): Ld => ({
  '@type': 'Offer', name, price: usd.toFixed(2), priceCurrency: 'USD', description,
  priceSpecification: { '@type': 'UnitPriceSpecification', price: usd, priceCurrency: 'USD', billingDuration: 'P1M', unitText: 'MONTH' },
});
export function softwareApplicationLd(): Ld {
  const a = PRICING.agency;
  return {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: SITE_NAME, url: SITE_URL,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: TITLE_STEM,
    offers: [
      monthly('Agency', a.monthlyUsd, `Includes ${a.seatsIncluded} client seats; $${a.extraSeatUsd} per extra seat; ${a.trialDays}-day trial.`),
      monthly('Local business', PRICING.business.monthlyUsd, 'One business, served by our agency.'),
    ],
  }; // never aggregateRating/review: we have none (no invented facts)
}
export function faqPageLd(faqs: readonly { q: string; a: string }[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
export function breadcrumbLd(trail: readonly Crumb[]): Ld {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_URL + c.path })) };
}
