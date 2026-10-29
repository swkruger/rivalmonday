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
    const values = [...Object.values(PRICING.agency), ...Object.values(PRICING.business)]
      .filter((x): x is number => typeof x === 'number')
      .map(String)
      .sort((a, b) => b.length - a.length);
    const copy = strings({
      cards: page.PLAN_CARDS,
      rows: page.FEATURE_ROWS.map((r) => [r.label, r.agency, r.business]),
      faq: page.PRICING_FAQ.map((f) => [f.q, f.a]),
      head: page.PRICING_PAGE,
    });
    for (const s of copy) {
      let t = s;
      for (const p of values) t = t.split(p).join('');
      expect(t, s).not.toMatch(/\d/);
    }
    const { agency, business } = PRICING;
    expect(page.PLAN_CARDS.pilot.agency.note).toContain(
      `$${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats · $${agency.extraSeatUsd} per extra seat · ${agency.trialDays}-day trial`,
    );
    expect(page.PLAN_CARDS.pilot.business.note).toBe(`Then $${business.monthlyUsd}/mo`);
    expect(page.PLAN_CARDS.trial.agency.note).toContain('one active client until you add a card');
  });

  it('pilot cards say free; trial business card never says free', () => {
    expect(page.PLAN_CARDS.pilot.agency.price).toBe('Free during the pilot');
    expect(page.PLAN_CARDS.pilot.business.price).toBe('Free during the pilot');
    expect(JSON.stringify(page.PLAN_CARDS.trial.business)).not.toMatch(/free/i);
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
