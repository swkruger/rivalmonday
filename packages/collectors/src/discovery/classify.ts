import type { Ai } from '@cs/ai';
import { PAGE_TYPES, type PageType } from '@cs/core';

export const PAGE_TYPE_OPTIONS: Record<PageType, string> = {
  home: 'Homepage of the business',
  pricing: 'Prices, rates, fees or cost of services',
  service: 'A page describing one service or a list of services offered',
  service_area: 'Towns, cities, ZIP codes or areas the business serves',
  promo: 'Specials, coupons, discounts, seasonal offers or financing offers',
  careers: 'Job openings, hiring or careers',
  team: 'Staff, team members, technicians or doctors',
  about: 'About the company, history, values',
  contact: 'Contact details, booking or appointment form',
  blog: 'Blog post, article, news or tips',
  other: 'Anything else (legal pages, privacy policy, login, galleries, reviews pages)',
};

/** Platform-level decision (not attributed to a tenant). Low confidence → needsReview. */
export async function classifyPage(ai: Ai, candidate: { url: string; text?: string }): Promise<{ pageType: PageType; needsReview: boolean }> {
  const result = await ai.decide(
    'decisions',
    { url: candidate.url, link_text: candidate.text ?? null },
    { page_type: { type: 'choice', instructions: 'What kind of page on a local service business website is this, judging by its URL and link text?', options: PAGE_TYPE_OPTIONS } },
    { agencyId: null, clientId: null },
  );
  const value = result.answers.page_type.value;
  const pageType = (PAGE_TYPES as readonly string[]).includes(String(value)) ? (value as PageType) : 'other';
  return { pageType, needsReview: result.needsReview.length > 0 };
}
