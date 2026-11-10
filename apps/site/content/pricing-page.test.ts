// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as page from './pricing-page';
import { PRICING } from './pricing';

const ledger = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'research', '2026-10-29-phase-17c-claim-check.md'), 'utf8');

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe('pricing page copy', () => {
  it('every figure comes from PRICING', () => {
    const values = [
      ...(Object.values(PRICING.agency) as unknown[]).filter((x) => typeof x === 'number') as number[],
      ...PRICING.agency.extraClientTiers.flatMap((t) => ([t.usd, t.toClient] as (number | null)[]).filter((x) => typeof x === 'number') as number[]),
      ...(Object.values(PRICING.business) as unknown[]).filter((x) => typeof x === 'number') as number[],
    ]
      .flatMap((n) => [String(n), n.toLocaleString('en-US')])
      // The tier line also prints the first extra client number (seats included + 1) and the last tier's "from" (cap + 1).
      .concat(String(PRICING.agency.seatsIncluded + 1), ...PRICING.agency.extraClientTiers.flatMap((t) => (t.toClient === null ? [] : [String(t.toClient + 1)])))
      .sort((a, b) => b.length - a.length);
    const copy = strings({
      cards: page.PLAN_CARDS,
      rows: page.FEATURE_ROWS.map((r) => [r.label, r.agency, r.business]),
      faq: [...page.PRICING_FAQ, ...page.BUSINESS_FAQ].map((f) => [f.q, f.a]),
      head: page.PRICING_PAGE,
    });
    for (const s of copy) {
      let t = s;
      for (const p of values) t = t.split(p).join('');
      expect(t, s).not.toMatch(/\d/);
    }
    const { agency, business } = PRICING;
    const { pilot, trial } = page.PLAN_CARDS;
    const [t1, t2] = agency.extraClientTiers;
    expect(pilot.agency.price).toBe(`$${agency.monthlyUsd}`);
    expect(pilot.agency.note).toBe(`or $${agency.yearlyUsd.toLocaleString('en-US')}/yr · ${agency.seatsIncluded} client seats included · ${agency.trialDays}-day trial`);
    expect(pilot.agency.rows).toEqual([
      { label: `Clients ${agency.seatsIncluded + 1}–${t1.toClient}`, value: `$${t1.usd} each/mo` },
      { label: `Clients ${t1.toClient + 1} and up`, value: `$${t2.usd} each/mo` },
    ]);
    expect(pilot.business.price).toBe(`$${business.monthlyUsd}`);
    expect(pilot.business.note).toBe('A typical price. Your agency sets it and sends the bill.');
    expect(trial.agency.note).toContain('one active client until you add a card');
  });

  it('pilot cards carry the chip; trial cards do not and never say free', () => {
    expect(page.PLAN_CARDS.pilot.agency.chip).toBe('Free during the pilot');
    expect(page.PLAN_CARDS.pilot.business.chip).toBe('Free during the pilot');
    expect(JSON.stringify(page.PLAN_CARDS.trial)).not.toMatch(/free (during|pilot)/i);
    expect(JSON.stringify(page.PLAN_CARDS.trial.business)).not.toMatch(/free/i);
    expect(page.PLAN_CARDS.trial.agency.name).toBe('For agencies');
  });

  it('agency points say Friday plus a connection for clients own AI tools', () => {
    expect(page.PLAN_CARDS.pilot.agency.points[2]).toBe("Friday, plus a connection for your clients' own AI tools, switched on per client");
  });

  it('each side has its own page copy', () => {
    for (const side of ['agency', 'business'] as const) {
      const c = page.PRICING_PAGE[side];
      expect(Object.keys(c).sort()).toEqual(['eyebrow', 'faqHeading', 'featuresHeading', 'h1', 'lead', 'leadTrial']);
      expect(c.eyebrow).toBe('Pricing');
      expect(c.faqHeading).toBe('Questions');
    }
    expect(page.PRICING_PAGE.agency.h1).toBe('One plan. Three clients included.');
    expect(page.PRICING_PAGE.agency.lead).toBe(page.PRICING_PAGE.agency.leadTrial);
    expect(page.PRICING_PAGE.business.lead).toBe('Free during the pilot. After that you pay the agency that runs it for you.');
    expect(page.PRICING_PAGE.business.leadTrial).toBe('You pay the agency that runs it for you.');
  });

  it('faq has the four topics and is pilot-neutral', () => {
    expect(page.PRICING_FAQ.map((f) => f.q)).toEqual([
      'Is it really white-label?',
      'Where does the data come from?',
      'What is MCP?',
      'How do I cancel?',
    ]);
    for (const f of page.PRICING_FAQ) {
      expect(f.a, f.q).not.toMatch(/pilot/i);
      expect(f.a.split(/\s+/).length, f.q).toBeLessThanOrEqual(70);
    }
    expect(page.PRICING_FAQ[0]!.a).toContain('on the roadmap');
    expect(page.PRICING_FAQ[1]!.link?.href).toBe('/sources');
  });

  it('feature rows point at ledger rows', () => {
    expect(page.FEATURE_ROWS).toHaveLength(10);
    for (const r of page.FEATURE_ROWS) {
      expect(r.ledger, r.label).toMatch(/^feat-[a-z-]+$/);
      expect(ledger, r.ledger).toContain(`| ${r.ledger} |`);
    }
  });

  it('faq rows point at ledger rows', () => {
    for (const f of page.PRICING_FAQ) {
      expect(f.ledger).toMatch(/^faq-[a-z-]+$/);
      expect(ledger, f.ledger).toContain(`| ${f.ledger} |`);
    }
  });
});
