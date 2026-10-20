import { describe, expect, it } from 'vitest';
import { type EmptyCopy, PAGE_COPY, type PageKey, type Tip } from '.';

/** 15b-1 pilot short copy: safe to render for every audience (the owner signs off the wording). */
const SLUGS = ['what-this-page-tells-you', 'how-to-use-it', 'common-questions'];
const pages = Object.entries(PAGE_COPY) as [PageKey, { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }][];
const entries = pages.flatMap(([page, c]) => [
  { where: `${page}.description`, audience: 'all', text: c.description },
  ...Object.entries(c.tips ?? {}).map(([k, t]) => ({ where: `${page}.tips.${k}`, audience: t.audience ?? 'all', text: `${t.title}\n${t.body}`, anchor: t.guideAnchor })),
  ...Object.entries(c.empty ?? {}).map(([k, e]) => ({ where: `${page}.empty.${k}`, audience: e.audience ?? 'all', text: `${e.title}\n${e.body}` })),
]);

describe('PAGE_COPY content', () => {
  it('has no placeholder copy left', () => {
    for (const e of entries) expect(e.text, e.where).not.toMatch(/placeholder|TODO/i);
  });

  it('uses only the single-brace placeholders renderCopy fills', () => {
    for (const e of entries) {
      for (const m of e.text.matchAll(/\{+([^}]*)\}+/g)) expect(['{agency}', '{assistant}', '{client}'], `${e.where}: ${m[0]}`).toContain(m[0]);
    }
  });

  it('never hard-codes the product or the assistant name, and uses miles, not km', () => {
    for (const e of entries) expect(e.text, e.where).not.toMatch(/rival\s*monday|\bfriday\b|\bkm\b|kilomet/i);
  });

  it('copy a client can see never mentions agency-internal concepts', () => {
    for (const e of entries.filter((x) => x.audience !== 'agency' && x.audience !== 'operator')) {
      expect(e.text, e.where).not.toMatch(/\bseats?\b|\brout(e|ed|ing)\b|upsell|AM check|place id|prospect/i);
    }
  });

  it('guide anchors are guide section slugs', () => {
    for (const e of entries) if ('anchor' in e && e.anchor !== undefined) expect(SLUGS, e.where).toContain(e.anchor);
  });
});
