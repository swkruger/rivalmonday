// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_ANCHORS } from './home';
import { HOW_FAQ, HOW_LINKS, JUMP_LINKS, weeklyCollection } from './how-it-works-page';

const CLAIMS = readFileSync(join(__dirname, '../../../docs/research/2026-10-29-phase-17c-claim-check.md'), 'utf8');
const items = HOW_FAQ.groups.flatMap((g) => g.items);

describe('how it works page copy', () => {
  it('every answer names a ledger row that exists', () => {
    for (const f of items) expect(CLAIMS, `${f.q}: ${f.ledger}`).toContain(`| ${f.ledger} |`);
  });
  it('answers are at most 70 words and questions are unique', () => {
    for (const f of items) expect(f.a.split(/\s+/).length, f.q).toBeLessThanOrEqual(70);
    expect(new Set(items.map((f) => f.q)).size).toBe(items.length);
  });
  it('website monitoring appears only when it is live', () => {
    expect(weeklyCollection(false)).not.toMatch(/web/i);
    expect(weeklyCollection(true)).toMatch(/web pages/);
    const copy = JSON.stringify({ HOW_LINKS, JUMP_LINKS, HOW_FAQ });
    expect(copy).not.toMatch(/website|snapshot/i);
  });
  it('only Sunday and Monday are named as days', () => {
    expect(JSON.stringify({ HOW_LINKS, JUMP_LINKS, HOW_FAQ })).not.toMatch(/Tuesday|Wednesday|Thursday|Friday,|Saturday/);
  });
  it('no banned claims, vendor names or pilot-only wording', () => {
    const copy = JSON.stringify({ HOW_LINKS, JUMP_LINKS, HOW_FAQ });
    expect(copy).not.toMatch(/nobody else|only platform|#1|best-in-class|guarantee/i);
    expect(copy).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/);
    expect(copy).not.toMatch(/\bpilot\b/i);
  });
  it('every how-it-works link into /agencies hits a section the agencies page has', () => {
    for (const l of HOW_LINKS.filter((x) => x.href.startsWith('/agencies#'))) expect(HOME_ANCHORS as readonly string[], l.href).toContain(l.href.split('#')[1]);
  });
});
