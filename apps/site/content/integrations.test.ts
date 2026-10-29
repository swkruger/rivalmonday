// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveTitle } from '../src/lib/metadata';
import { INTEGRATIONS, INTEGRATIONS_PAGE, listedIntegrations } from './integrations';
import { INTEGRATION_VERIFIED_IN } from './integrations-evidence';

const ROOT = join(__dirname, '../..', '..');
const CLAIMS = readFileSync(join(ROOT, 'docs/research/2026-10-29-phase-17c-claim-check.md'), 'utf8');
const LOGOS = readFileSync(join(ROOT, 'docs/research/2026-10-29-phase-17c-vendor-logos.md'), 'utf8');

/** Guideline URL (column 4) of the binding logo table; null when the cell has none. */
function ledgerUrls(): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const line of LOGOS.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length > 4 && /^[a-z]+$/.test(cells[1] ?? '') && /^(logo-ok|text-only|drop|unchecked)$/.test(cells[2] ?? '')) {
      out.set(cells[1]!, /^https:\/\/\S+/.exec(cells[4] ?? '')?.[0] ?? null);
    }
  }
  return out;
}

function ledgerVerdicts(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of LOGOS.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length > 3 && /^[a-z]+$/.test(cells[1] ?? '') && /^(logo-ok|text-only|drop|unchecked)$/.test(cells[2] ?? '')) {
      out.set(cells[1]!, cells[2]!);
    }
  }
  return out;
}

/** Strings of every integration (and the page copy), minus the disclaimer. */
function copy(): string[] {
  const out: string[] = [];
  for (const i of INTEGRATIONS) {
    out.push(i.name, i.role, i.oneLine, i.whatItIs, ...i.howWeUseIt, ...i.forYourAgency, i.seo.title, i.seo.description, i.seo.crumb);
  }
  out.push(INTEGRATIONS_PAGE.eyebrow, INTEGRATIONS_PAGE.h1, INTEGRATIONS_PAGE.lead);
  return out;
}

describe('integrations content', () => {
  it('nine slugs, unique', () => {
    const slugs = INTEGRATIONS.map((i) => i.slug);
    expect(slugs).toHaveLength(9);
    expect(new Set(slugs).size).toBe(9);
  });

  it('verifiedIn paths exist', () => {
    for (const i of INTEGRATIONS) {
      expect((INTEGRATION_VERIFIED_IN[i.slug] ?? []).length, i.slug).toBeGreaterThan(0);
      for (const p of (INTEGRATION_VERIFIED_IN[i.slug] ?? [])) expect(existsSync(join(ROOT, p)), `${i.slug}: ${p}`).toBe(true);
    }
  });

  it('ledger rows exist', () => {
    for (const i of INTEGRATIONS) {
      const row = CLAIMS.split('\n').find((l) => l.startsWith(`| int-${i.slug} |`));
      expect(row, `int-${i.slug}`).toBeDefined();
      for (const p of (INTEGRATION_VERIFIED_IN[i.slug] ?? [])) expect(row, `${i.slug}: ${p}`).toContain(p);
    }
  });

  it('brand verdicts match the ledger doc', () => {
    const ledger = ledgerVerdicts();
    for (const i of INTEGRATIONS) expect(i.brand.verdict, i.slug).toBe(ledger.get(i.slug));
    expect(ledger.size).toBe(9);
  });

  it('brand guideline URLs match the ledger doc', () => {
    const urls = ledgerUrls();
    for (const i of INTEGRATIONS) expect(i.brand.guidelineUrl, i.slug).toBe(urls.get(i.slug));
  });

  it('listedIntegrations drops only drop verdicts', () => {
    expect(listedIntegrations().every((i) => i.brand.verdict !== 'drop')).toBe(true);
  });

  it('no data vendor names', () => {
    for (const s of [...copy(), INTEGRATIONS_PAGE.disclaimer]) expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/i);
  });

  it('no partnership wording', () => {
    for (const s of copy()) expect(s, s).not.toMatch(/partner|official|certified|endorsed|approved by/i);
  });

  it('no digits outside an allowlist', () => {
    for (const s of copy()) expect(s.replace(/\bR2\b/g, ''), s).not.toMatch(/\d/);
  });

  it('no overclaims', () => {
    for (const s of copy()) expect(s, s).not.toMatch(/nobody|only platform|all (of )?our AI|cron/i);
  });

  it('effective titles <= 60, descriptions <= 155', () => {
    for (const i of INTEGRATIONS) {
      expect(effectiveTitle({ title: i.seo.title }).length, i.slug).toBeLessThanOrEqual(60);
      expect(i.seo.description.length, i.slug).toBeLessThanOrEqual(155);
    }
  });

  it('lists are at most 3 bullets and the disclaimer is set', () => {
    for (const i of INTEGRATIONS) {
      expect(i.howWeUseIt.length, i.slug).toBeLessThanOrEqual(3);
      expect(i.forYourAgency.length, i.slug).toBeLessThanOrEqual(3);
    }
    expect(INTEGRATIONS_PAGE.disclaimer).toMatch(/endorse/);
  });
});
