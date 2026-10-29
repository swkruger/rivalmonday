// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveTitle } from '../src/lib/metadata';
import {
  CAPABILITIES,
  CATEGORY_TABLE,
  COMPARE_COPY,
  FACT_SOURCES,
  RIVALS,
  RIVAL_MONDAY,
  comparePageEntry,
  enabledRivals,
  formatFactDate,
  watchedHubCell,
  websitesCell,
  websiteWeDiffer,
  type CapabilityKey,
} from './compare';
import { WEBSITE_MONITORING_LIVE } from './website-monitoring';

const ROOT = join(__dirname, '../..', '..');
const CLAIMS = readFileSync(join(ROOT, 'docs/research/2026-10-29-phase-17c-claim-check.md'), 'utf8');
const RESEARCH = readFileSync(join(ROOT, 'docs/research/2026-10-28-phase-17-comparison-facts.md'), 'utf8');

const SOURCE_IDS = new Set(FACT_SOURCES.map((s) => s.id));

/** Every published string of the module. */
function copy(): string[] {
  const out: string[] = [];
  for (const r of RIVALS) {
    out.push(r.name, r.kind, r.summary, ...r.facts.map((f) => f.text), ...r.pricing.map((p) => p.text), ...r.betterAt);
    out.push(...r.weDiffer.map((w) => w.text));
    for (const c of Object.values(r.cells)) if (c.label) out.push(c.label);
    const e = comparePageEntry(r);
    out.push(e.title, e.description, e.crumb, COMPARE_COPY.trademark(r.name));
  }
  for (const c of Object.values(RIVAL_MONDAY)) if (c.label) out.push(c.label);
  out.push(...CAPABILITIES.map((c) => c.label), ...CATEGORY_TABLE.columns);
  for (const row of CATEGORY_TABLE.rows) out.push(row.label, ...row.cells);
  out.push(COMPARE_COPY.asOf('2026-10-28'), COMPARE_COPY.corrections);
  // Both website-monitoring states, so the scans cover the copy the owner's flip will publish.
  for (const live of [false, true]) out.push(websitesCell(live).label ?? '', watchedHubCell(live), ...websiteWeDiffer(live).map((w) => w.text));
  return out;
}

describe('compare facts', () => {
  it('compare facts cite a known source', () => {
    for (const r of RIVALS) {
      expect(r.facts.length, r.slug).toBeGreaterThan(0);
      expect(r.pricing.length, r.slug).toBeGreaterThan(0);
      for (const f of [...r.facts, ...r.pricing]) expect(SOURCE_IDS.has(f.source), `${r.slug}: ${f.text}`).toBe(true);
      for (const [key, c] of Object.entries(r.cells)) {
        if (c.mark !== 'unknown') expect(c.source && SOURCE_IDS.has(c.source), `${r.slug}.${key}`).toBe(true);
      }
    }
  });

  it('fact sources match the research Sources list, with a URL and the checked date', () => {
    const listed = new Map<string, string>();
    for (const m of RESEARCH.matchAll(/^\[([a-z0-9-]+)\]: (https:\/\/\S+)/gm)) listed.set(m[1]!, m[2]!);
    expect(FACT_SOURCES.length).toBe(listed.size);
    for (const s of FACT_SOURCES) {
      expect(s.url, s.id).toBe(listed.get(s.id));
      expect(s.checkedOn).toBe('2026-10-28');
    }
    for (const r of RIVALS) expect(r.factsCheckedOn, r.slug).toBe('2026-10-28');
  });

  it('every rival has a cell for every capability', () => {
    const keys = CAPABILITIES.map((c) => c.key).sort();
    expect(keys).toHaveLength(15);
    for (const r of RIVALS) expect(Object.keys(r.cells).sort(), r.slug).toEqual(keys);
    expect(Object.keys(RIVAL_MONDAY).sort()).toEqual(keys);
  });

  it('no rival cell is no', () => {
    for (const r of RIVALS) {
      for (const [key, c] of Object.entries(r.cells)) {
        expect(['yes', 'partial', 'text', 'unknown'], `${r.slug}.${key}`).toContain(c.mark);
        expect(c.label ?? '', `${r.slug}.${key}`).not.toMatch(/^\s*(no|none)\b|✗|×/i);
      }
    }
  });

  it('text cells carry a label', () => {
    for (const r of RIVALS) for (const [key, c] of Object.entries(r.cells)) if (c.mark === 'text') expect(c.label, `${r.slug}.${key}`).toBeTruthy();
  });

  it('unknown cells carry no source and no label', () => {
    for (const r of RIVALS) {
      for (const [key, c] of Object.entries(r.cells)) {
        if (c.mark === 'unknown') {
          expect(c.source, `${r.slug}.${key}`).toBeUndefined();
          expect(c.label, `${r.slug}.${key}`).toBeUndefined();
        }
      }
    }
  });

  it('every rival has betterAt', () => {
    for (const r of RIVALS) expect(r.betterAt.length, r.slug).toBeGreaterThan(0);
  });

  it('our cells point at a ledger row', () => {
    for (const [key, c] of Object.entries(RIVAL_MONDAY)) {
      expect(c.ledger, key).toBe(`cap-${key}`);
      expect(CLAIMS, c.ledger).toContain(`| ${c.ledger} |`);
    }
  });

  it('our cells follow the ledger corrections', () => {
    expect(RIVAL_MONDAY.social.mark).toBe('no');
    expect(RIVAL_MONDAY.api.mark).toBe('no');
    expect(RIVAL_MONDAY.whiteLabel.mark).toBe('partial');
    expect(RIVAL_MONDAY.websites).toEqual(websitesCell(WEBSITE_MONITORING_LIVE)); // gated: WEB_MONITORING_ENABLED
    expect(RIVAL_MONDAY.ads.label).toMatch(/Meta/);
    expect(RIVAL_MONDAY.ads.label).toMatch(/Google/);
    expect(RIVAL_MONDAY.publicPricing.label).toContain('$229');
    expect(RIVAL_MONDAY.trial.label).toMatch(/30/);
  });

  it('weDiffer uses only yes capabilities', () => {
    for (const r of RIVALS) {
      expect(r.weDiffer.length, r.slug).toBeGreaterThan(0);
      for (const item of r.weDiffer) expect(RIVAL_MONDAY[item.key as CapabilityKey].mark, `${r.slug}: ${item.text}`).toBe('yes');
    }
  });

  it('no superlatives or absence claims', () => {
    for (const s of copy()) expect(s, s).not.toMatch(/\b(only|first|nobody else|#1|best|cheaper|doesn't have|does not have|lacks)\b/i);
    for (const s of copy()) expect(s, s).not.toMatch(/#1|nobody|no one else|unique/i);
  });

  it('absence is stated in the dated public-pages form', () => {
    for (const r of RIVALS) {
      for (const f of r.facts) {
        if (/\b(don't list|doesn't list|not stated|not described|not listed)\b/i.test(f.text)) expect(f.text, f.text).toMatch(/^As of Oct 28, 2026, /);
      }
    }
  });

  it('would-be page titles <= 60 and descriptions <= 155', () => {
    expect(RIVALS.map((r) => r.slug)).toEqual(['rivalmappd', 'brightlocal', 'local-falcon', 'birdeye', 'visualping']);
    for (const r of RIVALS) {
      const e = comparePageEntry(r);
      expect(e.slug).toBe(r.slug);
      expect(e.title).toBe(`Rival Monday vs ${r.name}`);
      expect(effectiveTitle({ title: e.title }).length, r.slug).toBeLessThanOrEqual(60);
      expect(e.description.length, r.slug).toBeLessThanOrEqual(155);
      expect(e.crumb).toBe(r.name);
    }
  });

  it('enabledRivals filters and keeps order', () => {
    expect(enabledRivals(['visualping', 'brightlocal']).map((r) => r.slug)).toEqual(['brightlocal', 'visualping']);
    expect(enabledRivals(['nope', 'birdeye']).map((r) => r.slug)).toEqual(['birdeye']);
    expect(enabledRivals([])).toEqual([]);
  });

  describe('enabledRivals default reads NEXT_PUBLIC_COMPARE_PAGES', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('follows the env list, in RIVALS order', async () => {
      vi.stubEnv('NEXT_PUBLIC_COMPARE_PAGES', 'visualping, RivalMappd,junk!');
      vi.resetModules();
      const m = await import('./compare');
      expect(m.enabledRivals().map((r) => r.slug)).toEqual(['rivalmappd', 'visualping']);
    });

    it('unset is empty (fail closed)', async () => {
      vi.stubEnv('NEXT_PUBLIC_COMPARE_PAGES', '');
      vi.resetModules();
      const m = await import('./compare');
      expect(m.enabledRivals()).toEqual([]);
    });
  });

  it('no data vendor names', () => {
    for (const s of copy()) expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/i);
  });

  it('dates render en-US in UTC', () => {
    expect(formatFactDate('2026-10-28')).toBe('Oct 28, 2026');
    expect(COMPARE_COPY.asOf('2026-10-28')).toBe('Information as of Oct 28, 2026, from public vendor pages.');
    expect(COMPARE_COPY.trademark('BrightLocal')).toBe('BrightLocal is a trademark of its owner; Rival Monday is not affiliated with BrightLocal.');
    expect(COMPARE_COPY.corrections).toContain('support@rivalmonday.app');
  });

  it('category table rows match its columns', () => {
    expect(CATEGORY_TABLE.columns).toEqual(['Rival Monday', 'DIY spreadsheets', 'Local-SEO toolkits', 'Reputation suites']);
    for (const row of CATEGORY_TABLE.rows) expect(row.cells, row.label).toHaveLength(CATEGORY_TABLE.columns.length);
    for (const row of CATEGORY_TABLE.rows) for (const c of row.cells.slice(2)) expect(c, c).toMatch(/^Typically /);
  });

  describe('website monitoring switch (WEBSITE_MONITORING_LIVE)', () => {
    it('ships off: partial "Switching on soon", no website weDiffer line, hub row without websites', () => {
      expect(WEBSITE_MONITORING_LIVE).toBe(false);
      expect(websitesCell(false)).toEqual({ mark: 'partial', label: 'Switching on soon', ledger: 'cap-websites' });
      expect(websiteWeDiffer(false)).toEqual([]);
      expect(watchedHubCell(false)).not.toMatch(/website/i);
      for (const r of RIVALS) expect(r.weDiffer.some((w) => w.key === 'websites'), r.slug).toBe(false);
      expect(CATEGORY_TABLE.rows[0]!.cells[0]).toBe(watchedHubCell(false));
    });

    it('on: yes cell, website line in weDiffer, hub row names websites', () => {
      expect(websitesCell(true).mark).toBe('yes');
      expect(websitesCell(true).ledger).toBe('cap-websites');
      expect(websiteWeDiffer(true)).toEqual([{ text: "Snapshots rivals' key pages and flags changes.", key: 'websites' }]);
      expect(watchedHubCell(true)).toMatch(/^Rivals' websites, /);
    });

    it('flipping the constant flips the cell, the hub row and the RivalMappd/Birdeye weDiffer lines', async () => {
      vi.resetModules();
      vi.doMock('./website-monitoring', () => ({ WEBSITE_MONITORING_LIVE: true }));
      try {
        const m = await import('./compare');
        expect(m.RIVAL_MONDAY.websites.mark).toBe('yes');
        expect(m.CATEGORY_TABLE.rows[0]!.cells[0]).toBe(watchedHubCell(true));
        const withLine = m.RIVALS.filter((r) => r.weDiffer.some((w) => w.key === 'websites')).map((r) => r.slug);
        expect(withLine).toEqual(['rivalmappd', 'birdeye']);
        for (const r of m.RIVALS) for (const w of r.weDiffer) expect(m.RIVAL_MONDAY[w.key].mark, `${r.slug}: ${w.text}`).toBe('yes');
      } finally {
        vi.doUnmock('./website-monitoring');
        vi.resetModules();
      }
    }, 20_000);
  });

  it('white-label cells do not carry the roadmap line (kept in FAQ and partners)', () => {
    expect(RIVAL_MONDAY.whiteLabel.label).not.toMatch(/roadmap/i);
    const row = CATEGORY_TABLE.rows.find((r) => r.label === 'Under your brand')!;
    expect(row.cells[0]).not.toMatch(/roadmap/i);
  });
});
