import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, comparePages: [] as string[], turnstileSiteKey: null as string | null } }));

import { BUSINESS_FAQ, FEATURE_ROWS, PLAN_CARDS, PRICING_FAQ, PRICING_PAGE } from '../../../content/pricing-page';
import { PRICING } from '../../../content/pricing';
import AgencyPricingPage from '../../app/agencies/pricing/page';
import BusinessPricingPage from '../../app/business/pricing/page';
import { Faq } from './faq';
import { FeatureList } from './feature-list';

const ledger = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'docs', 'research', '2026-10-29-phase-17c-claim-check.md'), 'utf8');

beforeEach(() => {
  pilot.pilotMode = true;
});
afterEach(() => cleanup());

/** Every agency plan figure as the site prints it ("$229", "$2,290", "$79", "$59"). */
function agencyFigures(): string[] {
  const a = PRICING.agency;
  const nums = [a.monthlyUsd, a.yearlyUsd, ...a.extraClientTiers.map((t) => t.usd)];
  return [...new Set(nums.flatMap((n) => [`$${n}`, `$${n.toLocaleString('en-US')}`]))];
}
const hasFigure = (text: string, f: string) => new RegExp(`${f.replace('$', '\\$')}(?![\\d,])`).test(text);

describe('pricing pages', () => {
  it('agency page shows only the agency card', () => {
    const { container } = render(<AgencyPricingPage />);
    expect(container.querySelectorAll('[data-slot="plan-agency"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="plan-business"]')).toBeNull();
    expect(container.querySelector('h1')!.textContent).toBe('One plan. Three clients included.');
    const card = container.querySelector('[data-slot="plan-agency"]')!;
    expect(card.textContent).toContain('Free during the pilot');
    expect(card.textContent).toContain("Friday, plus a connection for your clients' own AI tools, switched on per client");
    expect(card.querySelector('button')!.textContent).toBe('Join the free pilot');
  });

  it('business page shows only the business card and no agency plan number', () => {
    for (const pilotMode of [true, false]) {
      pilot.pilotMode = pilotMode;
      const { container } = render(<BusinessPricingPage />);
      expect(container.querySelectorAll('[data-slot="plan-business"]')).toHaveLength(1);
      expect(container.querySelector('[data-slot="plan-agency"]')).toBeNull();
      expect(container.querySelector('h1')!.textContent).toBe('One price. Your agency does the rest.');
      const text = container.textContent!;
      expect(text).toContain(`$${PRICING.business.monthlyUsd}`);
      for (const f of agencyFigures()) expect(hasFigure(text, f), `${pilotMode} ${f}`).toBe(false);
      expect(container.querySelector('section#join')).toBeTruthy();
      expect(text).not.toContain('SoftwareApplication');
      cleanup();
    }
  });

  it('pilot off: trial wording on both cards, no chip', () => {
    pilot.pilotMode = false;
    const agency = render(<AgencyPricingPage />).container;
    expect(agency.textContent).not.toMatch(/Free during/);
    expect(agency.querySelector('[data-slot="plan-agency"]')!.textContent).toContain(PLAN_CARDS.trial.agency.note);
    expect(agency.querySelector('[data-slot="plan-chip"]')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Start your free trial' })[0]!.getAttribute('href')).toBe('https://app.test/sign-up');
    cleanup();
    const business = render(<BusinessPricingPage />).container;
    expect(business.textContent).not.toMatch(/Free during/);
    expect(business.querySelector('[data-slot="plan-business"]')!.textContent).toContain(PLAN_CARDS.trial.business.note);
    expect(business.querySelector('[data-slot="plan-chip"]')).toBeNull();
    expect(business.textContent).toContain(PRICING_PAGE.business.leadTrial);
  });

  it('pilot on: the chip sits beside the title and the lead says free', () => {
    const { container } = render(<BusinessPricingPage />);
    expect(container.querySelector('[data-slot="plan-business"] [data-slot="plan-chip"]')!.textContent).toBe('Free during the pilot');
    expect(container.textContent).toContain(PRICING_PAGE.business.lead);
  });

  it('every agency figure on the card comes from PRICING', () => {
    const { container } = render(<AgencyPricingPage />);
    const card = container.querySelector('[data-slot="plan-agency"]')!.textContent!;
    const a = PRICING.agency;
    const [t1, t2] = a.extraClientTiers;
    for (const needle of [
      `$${a.monthlyUsd}`,
      `$${a.yearlyUsd.toLocaleString('en-US')}`,
      `${a.seatsIncluded} client seats included`,
      `${a.trialDays}-day trial`,
      `$${t1.usd}`,
      `$${t2.usd}`,
      `${a.seatsIncluded + 1}–${t1.toClient}`,
      `${t1.toClient + 1} and up`,
    ]) {
      expect(card, needle).toContain(needle);
    }
  });

  it('FAQ JSON-LD equals the visible questions', () => {
    for (const [Page, faq] of [[AgencyPricingPage, PRICING_FAQ], [BusinessPricingPage, BUSINESS_FAQ]] as const) {
      const { container } = render(<Page />);
      const visible = [...container.querySelectorAll('details summary')].map((s) => s.textContent);
      const answers = [...container.querySelectorAll('details > p:first-of-type')].map((p) => p.textContent);
      type Ld = { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] };
      const scripts = [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => [JSON.parse(s.textContent!) as Ld | Ld[]].flat());
      const ld = scripts.find((s) => s['@type'] === 'FAQPage')!;
      expect(ld.mainEntity!.map((m) => m.name)).toEqual(visible);
      expect(ld.mainEntity!.map((m) => m.acceptedAnswer.text)).toEqual(answers);
      expect(visible).toEqual(faq.map((f) => f.q));
      cleanup();
    }
  });

  it('software JSON-LD only on the agency page', () => {
    const agency = render(<AgencyPricingPage />).container;
    expect(agency.innerHTML).toContain('SoftwareApplication');
    cleanup();
    expect(render(<BusinessPricingPage />).container.innerHTML).not.toContain('SoftwareApplication');
  });

  it('business FAQ ledger ids exist in the claim check', () => {
    expect(BUSINESS_FAQ.map((f) => f.q)).toEqual(['Do I need an agency?', 'Who sends the bill?', 'Where does the information come from?', 'How do I cancel?']);
    for (const f of BUSINESS_FAQ) expect(ledger, f.ledger).toContain(`| ${f.ledger} |`);
    expect(BUSINESS_FAQ[1]!.a).toContain(`$${PRICING.business.monthlyUsd} a month is a typical price, not a fixed one.`);
    expect(BUSINESS_FAQ[2]!.a).toBe(PRICING_FAQ[1]!.a);
    expect(BUSINESS_FAQ[2]!.link).toEqual(PRICING_FAQ[1]!.link);
  });

  it('both pages keep the eyebrow and FAQ heading', () => {
    expect(PRICING_PAGE.agency.eyebrow).toBe('Pricing');
    expect(PRICING_PAGE.business.faqHeading).toBe('Questions');
    const { container } = render(<AgencyPricingPage />);
    expect(container.querySelector('#faq-heading')!.textContent).toBe('Questions');
    expect(container.querySelector('#features-heading')!.textContent).toBe('What the plan includes');
  });
});

describe('FeatureList', () => {
  it('feature list leaves out rows the side does not get', () => {
    const business = render(<FeatureList side="business" />).container;
    expect(business.textContent).not.toContain('Your branding');
    expect(business.textContent).not.toContain('Client billing in your name');
    expect(business.textContent).toContain('Set by your agency');
    expect(business.querySelectorAll('li')).toHaveLength(FEATURE_ROWS.filter((r) => r.business !== false).length);
    cleanup();
    const agency = render(<FeatureList side="agency" />).container;
    for (const r of FEATURE_ROWS) expect(agency.textContent).toContain(r.label);
  });
});

describe('Faq', () => {
  it('renders the heading, the items and their links', () => {
    const { container } = render(<Faq items={PRICING_FAQ} heading="Questions" />);
    expect(container.querySelector('h2#faq-heading')!.textContent).toBe('Questions');
    expect(container.querySelector('a[href="/sources"]')).toBeTruthy();
    expect(container.querySelectorAll('details')).toHaveLength(4);
  });
});
