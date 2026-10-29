// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveTitle } from '../src/lib/metadata';
import { SOURCES, SOURCES_PAGE } from './sources';
import { SOURCE_VERIFIED_IN } from './sources-evidence';

const ROOT = join(__dirname, '../..', '..');
const CLAIMS = readFileSync(join(ROOT, 'docs/research/2026-10-29-phase-17c-claim-check.md'), 'utf8');

/** Every string of the sources copy, minus the trademark note. */
function copy(): string[] {
  const out: string[] = [];
  for (const s of SOURCES) {
    out.push(s.name, s.oneLine, ...s.whatWeCollect, s.howOften, ...s.whatWeDont, s.inTheBrief, s.seo.title, s.seo.description, s.seo.crumb);
  }
  out.push(SOURCES_PAGE.eyebrow, SOURCES_PAGE.h1, SOURCES_PAGE.lead);
  return out;
}

describe('sources content', () => {
  it('six slugs and no social', () => {
    const slugs = SOURCES.map((s) => s.slug);
    expect(slugs).toEqual(['competitor-websites', 'google-reviews', 'google-business-profile', 'ads', 'local-map-rankings', 'job-postings']);
    for (const s of copy()) expect(s, s).not.toMatch(/social|facebook|instagram|tiktok|linkedin/i);
  });

  it('verifiedIn paths exist', () => {
    for (const s of SOURCES) {
      expect((SOURCE_VERIFIED_IN[s.slug] ?? []).length, s.slug).toBeGreaterThan(0);
      for (const p of SOURCE_VERIFIED_IN[s.slug] ?? []) expect(existsSync(join(ROOT, p)), `${s.slug}: ${p}`).toBe(true);
    }
  });

  it('ledger rows exist', () => {
    for (const s of SOURCES) {
      const row = CLAIMS.split('\n').find((l) => l.startsWith(`| src-${s.slug} |`));
      expect(row, `src-${s.slug}`).toBeDefined();
      for (const p of SOURCE_VERIFIED_IN[s.slug] ?? []) expect(row, `${s.slug}: ${p}`).toContain(p);
    }
  });

  it('effective titles <= 60, descriptions <= 155', () => {
    for (const s of SOURCES) {
      expect(effectiveTitle({ title: s.seo.title }).length, s.slug).toBeLessThanOrEqual(60);
      expect(s.seo.description.length, s.slug).toBeLessThanOrEqual(155);
    }
  });

  it('no partnership wording outside trademarkNote', () => {
    for (const s of copy()) expect(s, s).not.toMatch(/partner|official|certified|endorsed|approved by|affiliated/i);
    expect(SOURCES_PAGE.trademarkNote).toMatch(/trademark/i);
  });

  it('no data vendor names', () => {
    for (const s of [...copy(), SOURCES_PAGE.trademarkNote]) expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/i);
  });

  it('states the ledger facts', () => {
    const by = (slug: string) => SOURCES.find((s) => s.slug === slug)!;
    const web = by('competitor-websites');
    const webText = [...web.whatWeCollect, web.howOften, ...web.whatWeDont, web.oneLine].join(' ');
    expect(webText).toMatch(/robots\.txt/);
    expect(webText).toMatch(/3 seconds/);
    const ads = by('ads');
    expect(ads.name + ads.whatWeCollect.join(' ')).toMatch(/Meta Ad Library/);
    expect(ads.name + ads.whatWeCollect.join(' ')).toMatch(/Google Ads Transparency Center/);
    expect(by('local-map-rankings').howOften).toMatch(/Sunday/);
    expect(by('local-map-rankings').whatWeCollect.join(' ')).toMatch(/five/);
    expect(by('google-reviews').whatWeDont.join(' ')).toMatch(/pseudonym/i);
    for (const s of SOURCES) expect(s.whatWeDont.join(' '), s.slug).toMatch(/log/i);
  });
});
