// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_ANCHORS } from './home';
import { HOW_FAQ, JUMP_LINKS, ROLES, WEEK, weeklyCollection } from './how-it-works-page';

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
    const copy = JSON.stringify({ WEEK, ROLES, HOW_FAQ });
    expect(copy).not.toMatch(/website|snapshot/i);
  });
  it('only Sunday and Monday are named as days', () => {
    expect(WEEK.stops.map((s) => s.when)).toEqual(['During the week', 'Sunday', 'Monday']);
    expect(JSON.stringify({ WEEK, ROLES, HOW_FAQ })).not.toMatch(/Tuesday|Wednesday|Thursday|Friday,|Saturday/);
  });
  it('no banned claims, vendor names or pilot-only wording', () => {
    const copy = JSON.stringify({ WEEK, ROLES, HOW_FAQ });
    expect(copy).not.toMatch(/nobody else|only platform|#1|best-in-class|guarantee/i);
    expect(copy).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/);
    expect(copy).not.toMatch(/\bpilot\b/i);
  });
  it('jump links point at sections on the page', () => {
    const anchors = new Set<string>([...HOME_ANCHORS, ROLES.id, 'faq']);
    for (const l of JUMP_LINKS) expect(anchors.has(l.href.slice(1)), l.href).toBe(true);
  });
});
