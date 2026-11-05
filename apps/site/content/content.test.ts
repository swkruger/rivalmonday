// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { weekStats } from '../src/components/sample/rank-map';
import { rivalRanks } from '../src/sample/rival-grid';
import { SAMPLE } from '../src/sample/schema';
import * as home from './home';
import * as how from './how-it-works';
import { NAV_EXTRA } from './pages';
import { PRICING } from './pricing';
import * as story from './rival-story';

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const allCopy = strings({ ...home, ...how });

// Literals allowed to carry digits: 17a's counter window.
// plus the fictional sample's own figures in the story copy.
const DIGIT_ALLOWLIST = ['Last 7 days', '8 of 49 points', "Now it's 31", '$69', '31 of 49', 'October 7'];

describe('site copy', () => {
  it('hero matches the decided copy', () => {
    expect(home.HERO.headline).toBe('Your competitors are making moves. Are you watching?');
    expect(home.HERO.sub).toContain('launching ads and changing prices.');
    expect(home.HERO.subNoWeb).toContain('collecting reviews and launching ads.');
    expect(home.HERO.primaryStart).toBe('agency-sample');
    expect(home.HERO.eyebrow).toBe('White-label competitor intelligence for agencies');
    expect(home.HERO.eyebrowPill).toBe('Pilot');
    expect([home.HERO.primaryCta, home.HERO.secondaryCta]).toEqual(['Join the free pilot', 'See what your clients get']);
    expect(home.HERO.heroCta).toBe('Get a free brief for one of your clients');
    expect(home.HERO.finePrint).toBe('Free during the pilot · No card needed · Limited places');
  });

  it('no digits in copy outside PRICING and an explicit allowlist', () => {
    const a = PRICING.agency;
    const priceValues = [
      ...(Object.values(a) as unknown[]).filter((x) => typeof x === 'number') as number[],
      ...a.extraClientTiers.flatMap((t) => ([t.usd, t.toClient] as (number | null)[]).filter((x) => typeof x === 'number') as number[]),
      ...(Object.values(PRICING.business) as unknown[]).filter((x) => typeof x === 'number') as number[],
    ]
      .flatMap((n) => [String(n), n.toLocaleString('en-US')])
      // The tier line prints each tier's first client number (previous cap + 1).
      .concat(String(a.seatsIncluded + 1), ...a.extraClientTiers.flatMap((t) => (t.toClient === null ? [] : [String(t.toClient + 1)])))
      .sort((a, b) => b.length - a.length);
    for (const s of allCopy) {
      let t = s.replace(/^\d+\.\s/, '');
      for (const lit of DIGIT_ALLOWLIST) t = t.split(lit).join('');
      for (const p of priceValues) t = t.split(p).join('');
      expect(t, s).not.toMatch(/\d/);
    }
    // the pricing lines really render PRICING
    expect(home.PRICING_LINES.agency).toContain(`$${PRICING.agency.monthlyUsd}/mo`);
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

  it('rival story moves: website capture only when live, oldest first', () => {
    const off = story.rivalStoryMoves(false);
    expect(off).toHaveLength(2);
    expect(off.map((m) => m.evidence)).not.toContain('e3');
    const on = story.rivalStoryMoves(true);
    expect(on).toHaveLength(3);
    expect(on.map((m) => m.date)).toEqual([...on.map((m) => m.date)].sort());
  });

  it('opportunity example is computed from PRICING and rendered in dollars', () => {
    expect(home.opportunityExample()).toMatchObject({ revenueUsd: 3980, costUsd: 1372, marginUsd: 2608 });
    const line = home.opportunityLine(home.opportunityExample());
    expect(line).toContain('$2,608');
    expect(line).toBe('For example: 20 clients at $199/mo is $3,980 revenue against $1,372 in platform cost, a margin of $2,608 a month.');
  });

  it('website-free copy never mentions price, websites or snapshots', () => {
    expect(home.HERO.subNoWeb).not.toMatch(/changing prices|price cut|\$69|website|snapshot/i);
    expect(home.RIVAL_STORY.bodyNoWeb).not.toMatch(/changing prices|price cut|\$69|website|snapshot/i);
  });

  it('HOME_ANCHORS has no duplicates, ends with join, and every non-join anchor has a section', () => {
    expect(new Set(home.HOME_ANCHORS).size).toBe(home.HOME_ANCHORS.length);
    expect(home.HOME_ANCHORS[home.HOME_ANCHORS.length - 1]).toBe('join');
    for (const a of home.HOME_ANCHORS) if (a !== 'join') expect(home.SECTIONS[a], a).toBeDefined();
    expect(home.SECTIONS['client-view'].heading).toBe('A dashboard, a Monday brief and an assistant, all under your brand.');
    expect(home.SECTIONS['client-view'].homeHeading).toBe('What your client opens on Monday morning.');
    expect(home.SECTIONS.checks.homeHeading).toBe('Your name is on every brief, so we check every sentence.');
    expect(home.SECTIONS.checks.heading).toBe('No evidence, no claim.');
  });

  it('typed story figures agree with the sample they come from', () => {
    const weeks = SAMPLE.rankGrid.weeks;
    const first = weekStats(rivalRanks(weeks[0]!.weekOf));
    const last = weekStats(rivalRanks(weeks[weeks.length - 1]!.weekOf));
    expect([first.top3, last.top3]).toEqual([8, 31]);
    expect(home.SECTIONS['rival-story'].body).toContain(`${first.top3} of ${first.points} points`);
    expect(home.SECTIONS['rival-story'].body).toContain(`Now it's ${last.top3}`);
    const e4 = story.rivalStoryMoves(true).find((m) => m.evidence === 'e4')!;
    const day = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${e4.date}T00:00:00Z`));
    expect(day).toBe('October 7');
    expect(home.BEFORE_AFTER.rows[0]!.after).toContain(day);
    const e3 = story.rivalStoryMoves(true).find((m) => m.evidence === 'e3')!;
    expect(e3.title).toContain('$69');
    expect(home.SECTIONS['rival-story'].body).toContain('$69');
  });

  it('lists and cast have the decided sizes', () => {
    expect(home.CEILING_LINES).toHaveLength(3);
    expect(home.OPPORTUNITY.outcomes).toHaveLength(3);
    expect(home.CAST.map((c) => c.name)).toEqual(['Monday', 'Friday', 'Rival Monday']);
    expect(home.BEFORE_AFTER.rows).toHaveLength(2);
    expect(home.COMMERCIAL.points).toHaveLength(3);
    expect(home.COMMERCIAL.roadmapLine.link.href).toBe('/roadmap');
    expect(home.OPPORTUNITY.link.href).toBe('/partners');
    expect(home.CLOSE_TRIAL.body).not.toMatch(/pilot|private link/i);
    expect(home.CLOSE_TRIAL.body).toBe('Start a free trial, add one client and see their starting-point brief: where they stand today against every rival.');
  });
});
