// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as home from './home';
import * as how from './how-it-works';
import { NAV_EXTRA } from './pages';
import { PRICING } from './pricing';

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const allCopy = strings({ ...home, ...how });

// Literals allowed to carry digits: 17a's counter window.
const DIGIT_ALLOWLIST = ['Last 7 days'];

describe('site copy', () => {
  it('hero matches the decided copy', () => {
    expect(home.HERO.headline).toBe("Your clients' rivals, briefed every Monday, under your brand.");
    expect(home.HERO.sub).toBe(
      'Rival Monday watches their websites, Google reviews, ads and map rankings, and turns every move into an evidence-backed brief, dashboard and AI assistant you sell as your own.',
    );
    expect(home.HERO.eyebrow).toBe('White-label competitor intelligence for agencies');
    expect(home.HERO.eyebrowPill).toBe('Pilot');
    expect([home.HERO.primaryCta, home.HERO.secondaryCta]).toEqual(['Join the free pilot', 'See what your clients get']);
    expect(home.HERO.finePrint).toBe('Free during the pilot · No card needed · Limited places');
  });

  it('no digits in copy outside PRICING and an explicit allowlist', () => {
    const priceValues = [...Object.values(PRICING.agency), ...Object.values(PRICING.business)]
      .filter((x): x is number => typeof x === 'number')
      .map(String)
      .sort((a, b) => b.length - a.length);
    for (const s of allCopy) {
      let t = s.replace(/^\d+\.\s/, '');
      for (const lit of DIGIT_ALLOWLIST) t = t.split(lit).join('');
      for (const p of priceValues) t = t.split(p).join('');
      expect(t, s).not.toMatch(/\d/);
    }
    // the pricing lines really render PRICING
    expect(home.PRICING_LINES.agency).toContain(`$${PRICING.agency.monthlyUsd}/mo`);
    expect(home.PRICING_LINES.business).toContain(`$${PRICING.business.monthlyUsd}/mo`);
  });

  it('headlines are at most 90 characters', () => {
    const headings = [
      ...Object.values(home.SECTIONS).map((s) => s.heading),
      home.CTA_BAND.heading,
      how.HOW_IT_WORKS.title,
      ...how.HOW_IT_WORKS.sections.map((s) => s.heading),
    ];
    for (const h of headings) expect(h.length, h).toBeLessThanOrEqual(90);
  });

  it('how-it-works paragraphs are at most 80 words', () => {
    for (const s of how.HOW_IT_WORKS.sections) expect(s.body.split(/\s+/).length, s.heading).toBeLessThanOrEqual(80);
  });

  it('no banned claims or vendor names', () => {
    for (const s of allCopy) {
      expect(s, s).not.toMatch(/nobody else|only platform|#1|best-in-class|guarantee/i);
      expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/);
    }
  });

  it('the recommendations roadmap note says it is planned and may change', () => {
    expect(home.RECOMMENDATIONS_ROADMAP.status).toBe('Coming soon');
    expect(home.RECOMMENDATIONS_ROADMAP.notice).toMatch(/not yet available/i);
    expect(home.RECOMMENDATIONS_ROADMAP.notice).toMatch(/may change/i);
    expect(home.RECOMMENDATIONS_ROADMAP.link.href).toBe('/roadmap');
  });

  it('every NAV_EXTRA /#id is in HOME_ANCHORS', () => {
    for (const n of NAV_EXTRA) {
      if (!n.href.startsWith('/#')) continue;
      expect(home.HOME_ANCHORS as readonly string[], n.href).toContain(n.href.slice(2));
    }
  });
});
