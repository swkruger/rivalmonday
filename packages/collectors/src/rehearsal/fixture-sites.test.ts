import { describe, expect, it } from 'vitest';
import { FIXTURE_CRAWL_DELAY_HOST_INDEX, fixtureResponse, fixtureVariant, isoWeekKey } from './fixture-sites';

const HOST = 'fx1.rehearsal.rivalmonday.app';
// ISO week 2026-W44 runs Mon 2026-10-26 … Sun 2026-11-01 (UTC).
const MON = new Date('2026-10-26T08:00:00Z');
const TUE_LATE = new Date('2026-10-27T23:59:59Z');
const WED = new Date('2026-10-28T00:00:00Z');
const SUN = new Date('2026-11-01T23:00:00Z');
const PAGES = ['', 'pricing', 'services', 'offers'];
const bodies = (group: number, now: Date) => PAGES.map((p) => fixtureResponse(HOST, `/g${group}/s1/${p}`, now).body);

/** First group whose variant this week is `pick(v)`. */
function groupWhere(pick: (v: number) => boolean, now: Date): number {
  for (let g = 1; g < 500; g++) if (pick(fixtureVariant(g, now))) return g;
  throw new Error('no group');
}

describe('fixture sites', () => {
  it('variant stable within a week, baseline before Wednesday', () => {
    expect(isoWeekKey(MON)).toBe('2026-W44');
    expect(isoWeekKey(SUN)).toBe('2026-W44');
    expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    for (let g = 1; g <= 50; g++) expect(fixtureVariant(g, SUN)).toBe(fixtureVariant(g, MON));

    const mutating = groupWhere((v) => v < 7, MON);
    const quiet = groupWhere((v) => v >= 7, MON);
    // Mon/Tue serve the baseline, identical to the previous week's baseline.
    expect(bodies(mutating, TUE_LATE)).toEqual(bodies(mutating, MON));
    // From Wednesday 00:00 UTC some page of a mutating group changes; it stays changed (deterministically) through Sunday.
    expect(bodies(mutating, WED)).not.toEqual(bodies(mutating, MON));
    expect(bodies(mutating, SUN)).toEqual(bodies(mutating, WED));
    // A quiet group never changes.
    expect(bodies(quiet, SUN)).toEqual(bodies(quiet, MON));
    // Baselines do not drift week to week (a quiet week then shows no change at all).
    expect(bodies(mutating, new Date('2026-10-19T08:00:00Z'))).toEqual(bodies(mutating, MON));
  });

  it('~70 % of 1 000 groups mutate', () => {
    let n = 0;
    for (let g = 1; g <= 1000; g++) if (fixtureVariant(g, WED) < 7) n++;
    expect(n).toBeGreaterThanOrEqual(650);
    expect(n).toBeLessThanOrEqual(750);
  });

  it('fx5 robots has Crawl-delay 30', () => {
    expect(FIXTURE_CRAWL_DELAY_HOST_INDEX).toBe(4);
    const fx5 = fixtureResponse('fx5.rehearsal.rivalmonday.app', '/robots.txt', MON);
    expect(fx5.status).toBe(200);
    expect(fx5.headers['content-type']).toMatch(/^text\/plain/);
    expect(fx5.body).toMatch(/^Crawl-delay: 30$/m);
    const fx1 = fixtureResponse(HOST, '/robots.txt', MON);
    expect(fx1.body).toMatch(/^User-agent: \*$/m);
    expect(fx1.body).not.toMatch(/Crawl-delay/);
  });

  it('serves self-contained pages and 404s anything else', () => {
    for (const p of PAGES) {
      const r = fixtureResponse(HOST, `/g7/s2/${p}`, MON);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/^text\/html/);
      expect(r.body).not.toMatch(/<(img|script|link|iframe|video|audio|source)\b|url\(/i);
    }
    expect(fixtureResponse(HOST, '/g7/s2', MON).status).toBe(200);
    expect(fixtureResponse(HOST, '/g7/s2/pricing?x=1', MON).status).toBe(200);
    expect(fixtureResponse(HOST, '/g7/s2/careers', MON).status).toBe(404);
    expect(fixtureResponse(HOST, '/', MON).status).toBe(404);
    expect(fixtureResponse(HOST, '/g0/s1/', MON).status).toBe(404);
    // Deterministic: same input, same bytes.
    expect(fixtureResponse(HOST, '/g7/s2/pricing', WED)).toEqual(fixtureResponse(HOST, '/g7/s2/pricing', WED));
  });
});
