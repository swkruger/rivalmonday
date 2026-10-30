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
/** Stable `@id`s so the site's entities reference each other instead of repeating themselves. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationLd(sameAs: readonly string[]): Ld {
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': ORG_ID, name: SITE_NAME, url: SITE_URL,
    logo: `${SITE_URL}/apple-icon`, description: TITLE_STEM,
    ...(sameAs.length ? { sameAs: [...sameAs] } : {}),
  };
}
/** The site itself, published by the organization (no SearchAction: the site has no search). */
export function websiteLd(): Ld {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: SITE_URL, inLanguage: 'en-US', publisher: { '@id': ORG_ID } };
}
const monthly = (name: string, usd: number, description: string): Ld => ({
  '@type': 'Offer', name, price: usd.toFixed(2), priceCurrency: 'USD', description,
  priceSpecification: { '@type': 'UnitPriceSpecification', price: usd, priceCurrency: 'USD', billingDuration: 'P1M', unitText: 'MONTH' },
});
export function softwareApplicationLd(): Ld {
  const a = PRICING.agency;
  return {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: SITE_NAME, url: SITE_URL,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: TITLE_STEM, publisher: { '@id': ORG_ID },
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
/** A guide as an `Article` written and published by the organization (no invented author persona). */
export function articleLd(a: { path: string; headline: string; description: string; published: string; updated: string }): Ld {
  const url = SITE_URL + a.path;
  return {
    '@context': 'https://schema.org', '@type': 'Article', headline: a.headline, description: a.description,
    datePublished: a.published, dateModified: a.updated, inLanguage: 'en-US',
    mainEntityOfPage: url, url, image: `${url}/opengraph-image`,
    author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID }, isPartOf: { '@id': WEBSITE_ID },
  };
}
