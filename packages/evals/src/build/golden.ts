import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NumericChange } from '@cs/db';
import { alignBlocks, buildTagState, diffFacts, extractBlocks, extractNumericFacts, MONEY_KINDS } from '@cs/engine';
import { type EvalCase, PACKAGE_DIR } from '../case';
import { type ChangeInput, isEvalVertical, labelCase, questionsFor, redactDeep, slug } from './common';

/** The engine's own web fixture pages (packages/engine/test/fixtures/web). */
export const ENGINE_FIXTURE_DIR = join(PACKAGE_DIR, '..', 'engine', 'test', 'fixtures', 'web');
/** Hand-saved archive.org before/after pairs: see fixtures/golden/README. */
export const GOLDEN_FIXTURE_DIR = join(PACKAGE_DIR, 'fixtures', 'golden');
export const MAX_ARCHIVE_PAIRS = 20;
/** Spec decision 12: 60 golden cases in total, archive pairs included. */
export const GOLDEN_TOTAL = 60;
/** Archive budget: blocks are taken round-robin across pairs (each pair's best block first) until this many. */
export const ARCHIVE_MAX_CASES = 20;

export interface GoldenPage { file: string; vertical: string; competitorName: string; pageUrl: string; html: string }
interface PageMeta { file: string; vertical: string; competitorName: string; pageUrl: string }

const PAGE_META: PageMeta[] = [
  { file: 'dental-home-v1.html', vertical: 'dental', competitorName: 'Bright Smiles Dental', pageUrl: 'https://bright-smiles.example/' },
  { file: 'dental-home-v2.html', vertical: 'dental', competitorName: 'Bright Smiles Dental', pageUrl: 'https://bright-smiles.example/' },
  { file: 'hvac-home-v1.html', vertical: 'hvac_plumbing', competitorName: 'Smith HVAC', pageUrl: 'https://smith-hvac.example/' },
  { file: 'hvac-home-v2.html', vertical: 'hvac_plumbing', competitorName: 'Smith HVAC', pageUrl: 'https://smith-hvac.example/' },
];
// LF-normalised so a CRLF checkout builds the same cases.
const readPage = (file: string) => readFileSync(join(ENGINE_FIXTURE_DIR, file), 'utf8').replace(/\r\n/g, '\n');
export const GOLDEN_PAGES: GoldenPage[] = PAGE_META.map((m) => ({ ...m, html: readPage(m.file) }));

/** Natural v1 → v2 diffs of the engine fixtures (unlabelled: pre-label + owner confirm). */
const NATURAL_PAIRS: [string, string][] = [['dental-home-v1.html', 'dental-home-v2.html'], ['hvac-home-v1.html', 'hvac-home-v2.html']];

export interface GoldenMutation {
  id: string;
  page: string;
  find: string;
  replace: string;
  meaningful: boolean;
  changeType: string;
  /** Service id of the page's vertical, or 'none'. */
  service: string;
}

const m = (page: string, id: string, find: string, replace: string, meaningful: boolean, changeType: string, service = 'none'): GoldenMutation =>
  ({ id, page, find, replace, meaningful, changeType, service });
const add = (anchor: string, html: string) => [anchor, `${html}\n  ${anchor}`] as const;

const D1 = 'dental-home-v1.html';
const D2 = 'dental-home-v2.html';
const H1 = 'hvac-home-v1.html';
const H2 = 'hvac-home-v2.html';
const D_LIST_END = '</ul>';
const D_MAIN_END = '</main>';
const H_TESTIMONIAL = '<section class="testimonial">';
const H_CARDS_END = '</section>\n  <section class="testimonial">';

/** Scripted single-block edits with labels known by construction (each yields exactly one aligned change). */
export const GOLDEN_MUTATIONS: GoldenMutation[] = [
  // dental v1
  m(D1, 'new-service', ...add(D_LIST_END, '  <li>Invisalign clear aligners</li>\n  '), true, 'new_service', 'invisalign'),
  m(D1, 'service-removed', '<li>Teeth whitening</li>', '', true, 'service_removed', 'whitening'),
  m(D1, 'new-patient-promo', ...add(D_LIST_END, '  <li>New patient special: exam, X-rays and cleaning for $99</li>\n  '), true, 'promo', 'new_patient_special'),
  m(D1, 'price-appears', '<li>Cleanings and exams</li>', '<li>Cleanings and exams from $89</li>', true, 'price_change', 'cleaning_exam'),
  m(D1, 'emergency-hours', '<li>Emergency dental care</li>', '<li>Same-day emergency dental care, now open Saturdays</li>', true, 'content', 'emergency_dental'),
  m(D1, 'area', '<h1>Gentle family dentistry in Frisco</h1>', '<h1>Gentle family dentistry in Frisco and Little Elm</h1>', true, 'service_area_change'),
  m(D1, 'new-location', ...add(D_MAIN_END, '<p>Now open: our second office in Prosper.</p>\n'), true, 'new_location'),
  m(D1, 'hiring', ...add(D_MAIN_END, '<p>We are hiring a dental hygienist. Apply today.</p>\n'), true, 'hiring'),
  m(D1, 'testimonial', '<blockquote>Great staff!</blockquote>', '<blockquote>Great staff, highly recommend!</blockquote>', false, 'cosmetic'),
  m(D1, 'heading-comma', '<h1>Gentle family dentistry in Frisco</h1>', '<h1>Gentle, family dentistry in Frisco</h1>', false, 'cosmetic'),
  m(D1, 'membership', ...add(D_LIST_END, '  <li>In-house dental savings plan: $25 per month, no insurance needed</li>\n  '), true, 'new_service', 'membership_plan'),
  m(D1, 'capitalised', '<li>Teeth whitening</li>', '<li>Teeth Whitening</li>', false, 'cosmetic', 'whitening'),
  // dental v2
  m(D2, 'whitening-price-cut', '<li>Teeth whitening</li>', '<li>Teeth whitening, now $199 (was $399)</li>', true, 'price_change', 'whitening'),
  m(D2, 'invisalign-removed', '<li>Invisalign clear aligners now offered at our Frisco office</li>', '', true, 'service_removed', 'invisalign'),
  m(D2, 'implants', ...add(D_LIST_END, '  <li>Dental implants now available</li>\n  '), true, 'new_service', 'implants'),
  m(D2, 'teacher-discount', ...add(D_LIST_END, '  <li>15% off all treatment for teachers this fall</li>\n  '), true, 'promo'),
  m(D2, 'sedation', ...add(D_LIST_END, '  <li>Sedation dentistry for anxious patients</li>\n  '), true, 'new_service', 'sedation'),
  m(D2, 'emergency-on-call', '<li>Emergency dental care</li>', '<li>Emergency dental care with a 24/7 on-call dentist</li>', true, 'content', 'emergency_dental'),
  m(D2, 'area', ...add(D_MAIN_END, '<p>Serving Frisco, Plano and The Colony.</p>\n'), true, 'service_area_change'),
  m(D2, 'hiring', ...add(D_MAIN_END, '<p>Now hiring: front desk coordinator.</p>\n'), true, 'hiring'),
  m(D2, 'testimonial', '<blockquote>Great staff!!</blockquote>', '<blockquote>Great staff!!!</blockquote>', false, 'cosmetic'),
  m(D2, 'ampersand', '<li>Cleanings and exams</li>', '<li>Cleanings &amp; exams</li>', false, 'cosmetic', 'cleaning_exam'),
  m(D2, 'new-location', ...add(D_MAIN_END, '<p>Our new McKinney office opens in March.</p>\n'), true, 'new_location'),
  m(D2, 'dentures', ...add(D_LIST_END, '  <li>Dentures and partials with same-week fittings</li>\n  '), true, 'new_service', 'dentures'),
  // hvac v1
  m(H1, 'price-cut', '<strong>$89</strong>', '<strong>$59</strong>', true, 'price_change', 'ac_tune_up'),
  m(H1, 'diagnostic-fee', '<p>Upfront pricing, no overtime charges.</p>', '<p>Upfront pricing: diagnostic visit now $129.</p>', true, 'price_change', 'furnace_repair'),
  m(H1, 'promo-bar', 'Fall furnace tune-up special — book by October 31', 'Fall furnace tune-up special — $50 off, book by October 31', true, 'promo', 'furnace_tune_up'),
  m(H1, 'duct-cleaning', ...add(H_TESTIMONIAL, '<p>New: whole-home air duct cleaning now available in Plano.</p>'), true, 'new_service', 'duct_cleaning'),
  m(H1, 'water-heaters-dropped', '<p>Same-day tank and tankless installs.</p>', '<p>Water heater installs are no longer offered.</p>', true, 'service_removed', 'water_heater'),
  m(H1, 'area', ...add(H_TESTIMONIAL, '<p>Now serving Wylie, McKinney and Frisco.</p>'), true, 'service_area_change'),
  m(H1, 'new-location', ...add(H_TESTIMONIAL, '<p>Visit our new second office in Carrollton, open now.</p>'), true, 'new_location'),
  m(H1, 'hiring', ...add(H_TESTIMONIAL, '<p>We are hiring licensed HVAC technicians. Apply today.</p>'), true, 'hiring'),
  m(H1, 'warranty', '<p>Upfront pricing, no overtime charges.</p>', '<p>Upfront pricing, no overtime charges, and a 2-year labor warranty on every repair.</p>', true, 'content', 'furnace_repair'),
  m(H1, 'testimonial', 'Great service!</blockquote>', 'Great service!!</blockquote>', false, 'cosmetic'),
  m(H1, 'heading-and', '<h1>Heating &amp; Cooling Experts in Plano</h1>', '<h1>Heating and Cooling Experts in Plano</h1>', false, 'cosmetic'),
  m(H1, 'financing', ...add(H_TESTIMONIAL, '<p>Financing available: 0% APR for 18 months on new systems.</p>'), true, 'promo', 'financing'),
  // hvac v2
  m(H2, 'price-rise', '<strong>$69</strong>', '<strong>$99</strong>', true, 'price_change', 'ac_tune_up'),
  m(H2, 'winter-promo', 'Fall furnace tune-up special — book by October 31', 'Winter special: furnace tune-up for $79 through December 15', true, 'promo', 'furnace_tune_up'),
  m(H2, 'sewer', ...add(H_TESTIMONIAL, '<p>Now offering sewer line camera inspections.</p>'), true, 'new_service', 'sewer_line'),
  m(H2, 'furnace-dropped', '<p>Upfront pricing, no overtime charges.</p>', '<p>Furnace repair is no longer offered; we now focus on cooling.</p>', true, 'service_removed', 'furnace_repair'),
  m(H2, 'area', ...add(H_TESTIMONIAL, '<p>Our service area now includes Denton and Lewisville.</p>'), true, 'service_area_change'),
  m(H2, 'new-location', ...add(H_TESTIMONIAL, '<p>Grand opening: our new Fort Worth branch.</p>'), true, 'new_location'),
  m(H2, 'hiring', ...add(H_TESTIMONIAL, '<p>Careers: now hiring plumbing apprentices at $25 per hour.</p>'), true, 'hiring'),
  m(H2, 'warranty', '<p>Same-day tank and tankless installs.</p>', '<p>Same-day tank and tankless installs, backed by a 10-year warranty.</p>', true, 'content', 'water_heater'),
  m(H2, 'lead-comma', 'Licensed, insured, and available', 'Licensed, insured and available', false, 'cosmetic'),
  m(H2, 'testimonial', 'They fixed our AC in under an hour.', 'Fixed our AC in under an hour.', false, 'cosmetic'),
  m(H2, 'comfort-club', ...add(H_CARDS_END, '<p>Join our Comfort Club membership for $15/month and get priority service.</p>'), true, 'new_service', 'maintenance_plan'),
  m(H2, 'drain-promo', ...add(H_TESTIMONIAL, '<p>Drain cleaning special: 20% off this month.</p>'), true, 'promo', 'drain_cleaning'),
];

export interface GoldenChange { kind: string; beforeText: string | null; afterText: string | null; numericChanges: NumericChange[] }

/** The engine's diff path, rules only: block extraction → alignBlocks → numeric facts. No embedding gate, no LLM fact fallback. */
export function goldenChanges(beforeHtml: string, afterHtml: string): GoldenChange[] {
  return alignBlocks(extractBlocks(beforeHtml), extractBlocks(afterHtml))
    .filter((a) => a.kind !== 'unchanged')
    .map((a) => ({
      kind: a.kind,
      beforeText: a.before?.text ?? null,
      afterText: a.after?.text ?? null,
      numericChanges: diffFacts(a.before ? extractNumericFacts(a.before.text) : [], a.after ? extractNumericFacts(a.after.text) : []),
    }));
}

export function changeInput(meta: { verticalIds: string[]; competitorName: string; pageUrl: string | null; pageType: string | null }, ch: GoldenChange): ChangeInput {
  const verticalIds = [...meta.verticalIds].sort();
  const state = buildTagState({ competitorName: meta.competitorName, pageUrl: meta.pageUrl, pageType: meta.pageType, ...ch });
  return { state: redactDeep(state, [meta.competitorName]), verticalIds, questionKeys: Object.keys(questionsFor('changes', verticalIds)) };
}

const pageSlug = (file: string) => slug(file.replace(/\.html$/, ''));

/** Most informative first: money facts, then any numeric fact, then the most changed text; ties keep page order. */
function rankChanges(changes: GoldenChange[]): { ch: GoldenChange; i: number }[] {
  const score = (c: GoldenChange) => [
    c.numericChanges.some((n) => MONEY_KINDS.has(n.kind)) ? 1 : 0,
    c.numericChanges.length > 0 ? 1 : 0,
    Math.abs((c.afterText ?? '').length - (c.beforeText ?? '').length) + (c.kind === 'modified' ? 0 : (c.afterText ?? c.beforeText ?? '').length),
  ];
  return changes
    .map((ch, i) => ({ ch, i, s: score(ch) }))
    .sort((a, b) => b.s[0]! - a.s[0]! || b.s[1]! - a.s[1]! || b.s[2]! - a.s[2]! || a.i - b.i)
    .map(({ ch, i }) => ({ ch, i }));
}

/** ≤ MAX_ARCHIVE_PAIRS pairs (sorted by dir name), ≤ ARCHIVE_MAX_CASES cases picked round-robin over the ranked blocks of each pair. */
function archiveCases(fixtureDir: string): EvalCase[] {
  if (!existsSync(fixtureDir)) return [];
  const dirs = readdirSync(fixtureDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().slice(0, MAX_ARCHIVE_PAIRS);
  const ranked = dirs.map((dir) => {
    const at = (f: string) => readFileSync(join(fixtureDir, dir, f), 'utf8').replace(/\r\n/g, '\n');
    const meta = JSON.parse(at('meta.json')) as { vertical: string; competitorName: string; pageUrl: string; pageType?: string };
    if (!isEvalVertical(meta.vertical)) throw new Error(`fixtures/golden/${dir}: vertical "${meta.vertical}" has no eval pack`);
    return rankChanges(goldenChanges(at('before.html'), at('after.html'))).map(({ ch, i }) =>
      labelCase('changes', `changes-archive-${slug(dir)}-${i}`, 'archive', changeInput({ ...meta, verticalIds: [meta.vertical], pageType: meta.pageType ?? null }, ch)),
    );
  });
  const out: EvalCase[] = [];
  for (let round = 0; out.length < ARCHIVE_MAX_CASES && ranked.some((r) => r.length > round); round++) {
    for (const r of ranked) if (r[round] && out.length < ARCHIVE_MAX_CASES) out.push(r[round]!);
  }
  return out;
}

/** Round-robin across groups (one from each in turn), so trimming keeps every page represented. */
function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; groups.some((g) => g.length > i); i++) for (const g of groups) if (g[i] !== undefined) out.push(g[i]!);
  return out;
}

/**
 * 4 engine fixture pages × scripted mutations (labelled) + their natural v1→v2 diffs + fixtures/golden pairs (unlabelled).
 * Deterministic; at most GOLDEN_TOTAL cases: archive picks first, then scripted cases round-robin by page, then natural diffs.
 */
export function buildGolden(opts: { fixtureDir?: string } = {}): EvalCase[] {
  const page = (file: string) => GOLDEN_PAGES.find((p) => p.file === file)!;
  const scripted = new Map<string, EvalCase[]>();
  const natural: EvalCase[] = [];
  for (const mu of GOLDEN_MUTATIONS) {
    const p = page(mu.page);
    const changes = goldenChanges(p.html, p.html.replace(mu.find, mu.replace));
    if (changes.length !== 1) throw new Error(`golden mutation ${mu.page}/${mu.id} changed ${changes.length} blocks (expected 1)`);
    const input = changeInput({ ...p, verticalIds: [p.vertical], pageType: 'home' }, changes[0]!);
    const label = { meaningful: String(mu.meaningful), change_type: mu.changeType, [`service_${p.vertical}`]: mu.service };
    scripted.set(mu.page, [...(scripted.get(mu.page) ?? []), labelCase('changes', `changes-golden-${pageSlug(mu.page)}-${mu.id}`, 'golden', input, label, 'script')]);
  }
  for (const [a, b] of NATURAL_PAIRS) {
    const p = page(a);
    goldenChanges(p.html, page(b).html).forEach((ch, i) => {
      natural.push(labelCase('changes', `changes-golden-${pageSlug(a)}-to-v2-${i}`, 'golden', changeInput({ ...p, verticalIds: [p.vertical], pageType: 'home' }, ch)));
    });
  }
  const archive = archiveCases(opts.fixtureDir ?? GOLDEN_FIXTURE_DIR);
  return [...archive, ...[...interleave([...scripted.values()]), ...natural].slice(0, GOLDEN_TOTAL - archive.length)];
}
