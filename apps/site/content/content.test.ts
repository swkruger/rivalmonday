// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { weekStats } from '../src/components/sample/rank-map';
import { rivalRanks } from '../src/sample/rival-grid';
import { SAMPLE } from '../src/sample/schema';
import { CHOOSER } from './chooser';
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
const allCopy = strings({ ...home, ...how, CHOOSER });

// Literals allowed to carry digits: 17a's counter window.
// plus the fictional sample's own figures in the story copy.
const DIGIT_ALLOWLIST = ['Last 7 days', '8 of 49 points', "Now it's 31", '$69', '31 of 49', 'October 7'];

describe('site copy', () => {
  it('chooser copy matches the deck', () => {
    expect(CHOOSER.headline).toEqual({ lead: 'See what local rivals did', mark: 'this week.' });
    expect(CHOOSER.question).toBe('Which one are you?');
    expect(CHOOSER.bandHeading).toBe('Which one are you?');
    expect(CHOOSER.doors.map((d) => [d.id, d.title, d.cta, d.href])).toEqual([
      ['agency', 'I run an agency', 'For agencies →', '/agencies'],
      ['business', 'I own a local business', 'For local businesses →', '/business'],
    ]);
    expect(CHOOSER.sample).toEqual({ lead: 'Not sure yet?', label: 'See a sample brief', href: '/sample-brief' });
    expect(CHOOSER.proof).toEqual(['Public information only', 'No claim without evidence']);
  });

  it('chooser has no digits', () => {
    const all = strings(CHOOSER);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) expect(s, s).not.toMatch(/\d/);
  });

  it('hero matches the decided copy', () => {
    expect(home.HERO.headline).toEqual({ lead: 'Tell every client what their rivals did', mark: 'this week.' });
    expect(home.HERO.sub).toBe('Rival Monday tracks their map rankings, reviews and ads, then writes a Monday brief with the evidence attached. You sell it under your brand, at your price.');
    expect('subNoWeb' in home.HERO).toBe(false);
    expect(home.HERO.primaryStart).toBe('agency-sample');
    expect(home.HERO.eyebrow).toBe('White-label competitor intelligence for agencies');
    expect(home.HERO.eyebrowPill).toBe('Pilot');
    expect([home.HERO.primaryCta, home.HERO.secondaryCta]).toEqual(['Join the free pilot', 'See what your clients get']);
    expect(home.HERO.heroCta).toBe('Get a free brief for one client');
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
    expect(home.planCells()[0]!.value).toContain(`$${PRICING.agency.monthlyUsd}/mo`);
  });

  it('plan cells are computed from PRICING', () => {
    const a = PRICING.agency;
    const [monthly, first, last] = home.planCells();
    expect(home.planCells()).toHaveLength(3);
    expect(monthly!.value).toBe(`$${a.monthlyUsd}/mo`);
    expect(monthly!.label).toContain(`$${a.yearlyUsd.toLocaleString('en-US')}/yr`);
    expect(monthly!.label).toContain(`${a.seatsIncluded} client seats included`);
    expect(first!.value).toBe(`$${a.extraClientTiers[0]!.usd}`);
    expect(first!.label).toBe(`each for clients ${a.seatsIncluded + 1}–${a.extraClientTiers[0]!.toClient}`);
    expect(last!.value).toBe(`$${a.extraClientTiers[1]!.usd}`);
    expect(last!.label).toBe(`each from client ${a.extraClientTiers[0]!.toClient! + 1}`);
  });

  it('announcement has the three decided entries', () => {
    expect(home.ANNOUNCEMENT).toEqual({
      home: { text: 'The free pilot is open.' },
      agency: { text: 'The free pilot is open to agencies with local-business clients.', link: { label: 'Join the free pilot →', start: 'agency' } },
      business: { text: 'The free pilot is open. Local businesses can join the waitlist.', link: { label: 'Join the waitlist', start: 'business' } },
    });
  });

  it('headlines are at most 90 characters', () => {
    const headings = [
      `${home.HERO.headline.lead} ${home.HERO.headline.mark}`,
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

  it('opportunity cells are computed from PRICING', () => {
    const e = home.opportunityExample();
    expect(e).toMatchObject({ revenueUsd: 3980, costUsd: 1372, marginUsd: 2608 });
    expect(e.revenueUsd - e.costUsd).toBe(e.marginUsd);
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    expect(home.opportunityCells(e)).toEqual([
      { value: `${e.clients} clients`, label: `at ${fmt.format(e.clientPriceUsd)}/mo each` },
      { value: fmt.format(e.revenueUsd), label: 'revenue a month' },
      { value: fmt.format(e.costUsd), label: 'platform cost' },
      { value: fmt.format(e.marginUsd), label: 'margin a month' },
    ]);
    expect(home.opportunityCells()[3]!.value).toBe('$2,608');
  });

  it('ceiling heading is the decided line', () => {
    expect(home.SECTIONS.ceiling.heading).toBe('Your clients trust you. Give them one more reason to stay.');
  });

  it('website-free copy never mentions price, websites or snapshots', () => {
    expect(home.HERO.sub).not.toMatch(/changing prices|price cut|\$69|website|snapshot/i);
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
    expect(home.SECTIONS.recommendations.heading).toBe('Every rival move comes with a next step.');
    expect(home.SECTIONS.recommendations.body).toBe('Each recommendation comes from the brief, with its evidence attached and who it is for. This is the board your clients get. Try it: start, finish or dismiss a recommendation.');
    expect(home.HOW_STEPS[3].title).toBe('The brief lands on Monday');
    expect(home.CTA_BAND.heading).toBe('Try it on one client, free.');
    expect(home.CTA_BAND.body).toBe('Pilot places are limited because we work closely with each agency.');
    expect(home.CHECKS_SAMPLE_LINK).toEqual({ label: 'Open the sample brief →', href: '/sample-brief' });
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
    const e3 = story.rivalStoryMoves(true).find((m) => m.evidence === 'e3')!;
    expect(e3.title).toContain('$69');
    expect(home.SECTIONS['rival-story'].body).toContain('$69');
  });

  it('lists have the decided sizes', () => {
    expect(home.CEILING_LINES).toHaveLength(3);
    expect(home.OPPORTUNITY.outcomes).toHaveLength(3);
    expect(home.COMMERCIAL.points).toHaveLength(3);
    expect(home.COMMERCIAL.roadmapLine.link.href).toBe('/roadmap');
    expect(home.OPPORTUNITY.link.href).toBe('/partners');
    expect(home.CLOSE_TRIAL.body).not.toMatch(/pilot|private link/i);
    expect(home.CLOSE_TRIAL.body).toBe('Start a free trial, add one client and see their starting-point brief: where they stand today against every rival.');
  });
});
