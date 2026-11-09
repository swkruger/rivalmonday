import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';
import type { BriefEmailProps, BriefHighlights } from './types';

const branding = resolveBranding('Acme Marketing', null);
const item = (n: number) => ({
  competitorName: 'Smith HVAC', headline: `Headline ${n}`, whatChanged: `Changed ${n}`, whyItMatters: `Matters ${n}`, recommendedAction: `Do ${n}`, effort: 'L' as const, impact: 'H' as const, link: `https://app.example/l/i${n}`,
});
const highlights: BriefHighlights = {
  totals: { major: 2, notable: 40, minor: 198 }, minor: 198, moreLines: 37,
  lines: [
    { grade: 'major', text: 'Smith HVAC cut its tune-up price.', dates: 'Oct 1' },
    { grade: 'notable', text: 'Smith HVAC added 30 service pages.', dates: 'Oct 1–4' },
    { grade: 'notable', text: 'Jones Plumbing started 4 ads.', dates: 'Oct 2' },
  ],
};
const brief: BriefEmailProps = {
  branding, recipientName: 'Pat', clientName: 'A1 HVAC', deliveryDate: '2026-10-05', kind: 'standard', summary: 'Two competitors moved on price.',
  items: [item(1)], link: 'https://app.example/l/b', pdfLink: 'https://app.example/l/pdf', signOff: '— Sam, Acme Marketing', trend: { windowDays: 30, events: 4, businesses: [
    { competitorId: 'c1', name: 'A1 HVAC', self: true, reviews: 12, avgRating: 4.6, prevAvgRating: 4.5, activeAds: null },
    { competitorId: 'c2', name: 'Smith HVAC', self: false, reviews: 30, avgRating: 4.1, prevAvgRating: 4.4, activeAds: 7 },
  ] },
  highlights,
};
const render = (p: BriefEmailProps) => renderEmail({ template: 'brief', props: p });

describe('weekly brief highlights email', () => {
  it('highlights show at most 3 lines for a 240-event week', async () => {
    const r = await render(brief);
    expect(r.text.match(/^(Major|Notable): /gm)).toHaveLength(3);
    expect(r.text).toContain('+ 37 more notable changes');
    expect(r.text).toContain('+ 198 minor changes');
    expect(r.text).toContain('Notable: Jones Plumbing started 4 ads. (Oct 2)');
    expect(r.text).not.toContain('Smith HVAC 4.4');
    expect(r.html).not.toContain('<table class="trend');
  });
  it('stat line counts', async () => {
    const r = await render(brief);
    expect(r.text).toContain('2 Major · 40 Notable · 198 Minor changes');
    expect(r.text).toMatch(/highlights/i);
    expect(r.text).toContain('Changed 1');
    expect(r.text).not.toContain('Matters 1');
  });
  it('attached and not-attached sentences', async () => {
    expect((await render({ ...brief, attached: true })).text).toContain('Your full report is attached (PDF).');
    const n = await render({ ...brief, attached: false });
    expect(n.text).toContain('Your full report is ready to download as a PDF.');
    expect(n.html).toContain('https://app.example/l/pdf');
    expect(n.text).toContain('Open in your dashboard');
  });
  it('never dangles: not attached and no PDF link omits the download sentence', async () => {
    const n = await render({ ...brief, pdfLink: null, attached: false });
    expect(n.text).not.toContain('ready to download');
    expect(n.text).not.toContain('attached');
  });
  it('a zero-change week with the attachment still says the report is attached', async () => {
    const r = await render({ ...brief, kind: 'quiet', items: [], highlights: null, attachPdf: true, attached: true });
    expect(r.text).toContain('Your full report is attached (PDF).');
    expect((await render({ ...brief, kind: 'quiet', items: [], highlights: null, attached: false })).text).not.toContain('Your full report is');
  });
  it('singular wording', async () => {
    const r = await render({ ...brief, highlights: { ...highlights, moreLines: 1, minor: 1 } });
    expect(r.text).toContain('+ 1 more notable change');
    expect(r.text).not.toContain('1 more notable changes');
    expect(r.text).toContain('+ 1 minor change');
    expect(r.text).not.toContain('+ 0 ');
    expect((await render({ ...brief, highlights: { ...highlights, moreLines: 0, minor: 0 } })).text).not.toContain('+ 0');
  });
  it('quiet week with notable lines keeps the quiet intro', async () => {
    const r = await render({ ...brief, kind: 'quiet', items: [], highlights: { totals: { major: 0, notable: 1, minor: 0 }, minor: 0, moreLines: 0, lines: [highlights.lines[1]!] } });
    expect(r.text).toContain("There's nothing you need to do this week.");
    expect(r.text).toContain('0 Major · 1 Notable · 0 Minor changes');
    expect(r.text).toContain('Notable: Smith HVAC added 30 service pages. (Oct 1–4)');
  });
  it("old brief without highlights renders today's body", async () => {
    const r = await render({ ...brief, highlights: null });
    expect(r.text).toContain('Matters 1');
    expect(r.text).toContain('4.4 → 4.1');
    expect(r.text).not.toMatch(/highlights/i);
    expect(r.text).not.toContain('Your full report');
  });
  it('a starting point ignores highlights', async () => {
    const r = await render({ ...brief, kind: 'starting_point' });
    expect(r.text).toContain('Matters 1');
    expect(r.text).not.toMatch(/highlights/i);
  });
  it('no Rival Monday, scores or upsell in the email', async () => {
    const r = await render({ ...brief, attached: true });
    expect(r.html + r.text).not.toMatch(/rival monday|upsell|score|threshold/i);
  });
  it('previews exist', () => {
    const ids = EMAIL_PREVIEWS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['brief.highlights', 'brief.quiet_highlights', 'brief.highlights_not_attached']));
  });
});
