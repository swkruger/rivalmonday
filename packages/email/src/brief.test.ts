import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderBriefDocument, renderTrendReportDocument } from './document';
import { renderEmail } from './render';
import type { BriefEmailProps, TrendReportEmailProps } from './types';

const branding = resolveBranding('Acme Marketing', null);
const item = (n: number) => ({
  competitorName: 'Smith HVAC', headline: `Headline ${n}`, whatChanged: `Changed ${n}`, whyItMatters: `Matters ${n}`, recommendedAction: `Do ${n}`, effort: 'L' as const, impact: 'H' as const, link: `https://app.example/l/i${n}`,
});
const brief: BriefEmailProps = {
  branding, recipientName: 'Pat', clientName: 'A1 HVAC', deliveryDate: '2026-10-05', kind: 'standard', summary: 'Two competitors moved on price.',
  items: [item(1), item(2)], link: 'https://app.example/l/b', pdfLink: 'https://app.example/l/pdf', signOff: '— Sam, Acme Marketing',
  trend: { windowDays: 30, events: 4, businesses: [
    { competitorId: 'c1', name: 'A1 HVAC', self: true, reviews: 12, avgRating: 4.6, prevAvgRating: 4.5, activeAds: null },
    { competitorId: 'c2', name: 'Smith HVAC', self: false, reviews: 30, avgRating: 4.1, prevAvgRating: 4.4, activeAds: 7 },
  ] },
};

describe('brief email', () => {
  it('renders items in the given order with their deep links, the trend table and the PDF link', async () => {
    const r = await renderEmail({ template: 'brief', props: brief });
    expect(r.subject).toBe('Weekly competitor brief for A1 HVAC — 2026-10-05');
    expect(r.html.indexOf('Headline 1')).toBeLessThan(r.html.indexOf('Headline 2'));
    expect(r.html).toContain('https://app.example/l/i2');
    expect(r.html).toContain('https://app.example/l/pdf');
    expect(r.text).toContain('Smith HVAC');
    expect(r.text).toContain('4.4 → 4.1');
    expect(r.html).toContain('— Sam, Acme Marketing');
  });

  it('renders a quiet week with the trend snapshot and no items', async () => {
    const r = await renderEmail({ template: 'brief', props: { ...brief, kind: 'quiet', summary: 'No significant competitor moves this week.', items: [] } });
    expect(r.subject).toBe('Weekly competitor brief for A1 HVAC — quiet week');
    expect(r.text).toContain('No significant competitor moves this week.');
    expect(r.text).toContain('Smith HVAC');
  });

  it('a starting point is subjected with the agency product name (12b decided copy)', async () => {
    const r = await renderEmail({ template: 'brief', props: { ...brief, kind: 'starting_point', summary: 'Where A1 HVAC stands against the 2 rivals we now watch.' } });
    expect(r.subject).toBe('Your starting point with Acme Marketing');
    expect(r.html).toContain('Your starting point');
  });

  it('starting point renders tiles, scorecard, and a starting-point footer; self item has no competitor line', async () => {
    const scorecard = {
      tiles: [
        { label: 'Rating', value: '4.6', sub: 'rivals 4.4 median', trend: null, trendText: null },
        { label: 'New reviews · 90 d', value: '12', sub: 'rivals 30 median', trend: 'up' as const, trendText: '▲ 4 since your starting point' },
        { label: 'Reply rate', value: '—', sub: 'rivals 50% median', trend: null, trendText: null },
        { label: 'Top-3 in map pack', value: '31%', sub: 'rivals 20% median', trend: 'down' as const, trendText: '▼ 6 pts since your starting point' },
      ],
      table: { headers: ['Business', 'Rating'], rows: [{ cells: ['A1 HVAC (you)', '4.6'], self: true, tier: null }, { cells: ['Smith HVAC', '4.4'], self: false, tier: 'top' as const }] },
      openFirstMoves: [],
    };
    const props = { ...brief, kind: 'starting_point' as const, summary: 'Intro.', scorecard, items: [{ ...item(1), subject: 'self' as const, competitorName: 'A1 HVAC' }] };
    const r = await renderEmail({ template: 'brief', props });
    for (const t of ['Top-3 in map pack', '31%', 'rivals 4.4 median', '▲ 4 since your starting point', 'A1 HVAC (you)', 'Top rival', 'Your starting point for A1 HVAC']) expect(r.text).toContain(t);
    expect(r.html).toContain('aria-label="Scorecard');
    expect(r.html.indexOf('Top-3 in map pack')).toBeLessThan(r.html.indexOf('Headline 1'));
    expect(r.text).not.toContain('A1 HVAC · effort');
    expect(r.text).toContain('effort low');
    expect(r.text).not.toContain('Weekly competitor brief for');
    const q = await renderEmail({ template: 'brief', props: { ...props, kind: 'quiet', items: [], scorecard: { ...scorecard, openFirstMoves: ['Reply to reviews'] } } });
    expect(q.text).toContain('Where you stand');
    expect(q.text).toContain('First moves still open');
    expect(q.text.indexOf('Where you stand')).toBeLessThan(q.text.indexOf('Last 30 days'));
  });

  it('renders a print document without email-only links', async () => {
    const html = await renderBriefDocument({ ...brief, link: null, pdfLink: null });
    expect(html).toContain('@page');
    expect(html).not.toContain('https://app.example/l/pdf');
    expect(html).toContain('Headline 2');
  });

  it('keeps the trend table columns aligned: header and every business row share one table', async () => {
    // One table per row lets each row size its own columns, so a long name pushes its numbers right.
    const html = await renderBriefDocument({ ...brief, link: null, pdfLink: null });
    const header = html.indexOf('New reviews');
    const lastRow = html.indexOf('Smith HVAC', header);
    expect(header).toBeGreaterThan(-1);
    expect(lastRow).toBeGreaterThan(header);
    expect(html.slice(header, lastRow)).not.toContain('<table');
  });
});

describe('brief feedback line (7c2)', () => {
  const sam = { email: 'sam@acme.example', name: 'Sam' };
  it('brief shows the named feedback line', async () => {
    const r = await renderEmail({ template: 'brief', props: { ...brief, feedback: sam } });
    expect(r.text).toContain('Something look off? Reply to this email or write to Sam at sam@acme.example.');
    expect(r.text).not.toContain('mailto:');
    expect(r.html).toContain(`href="mailto:sam@acme.example?subject=${encodeURIComponent('Feedback: Weekly competitor brief for A1 HVAC — 2026-10-05')}"`);
    expect(r.html).not.toMatch(/rival ?monday/i);
  });

  it('falls back to "your agency"', async () => {
    const r = await renderEmail({ template: 'brief', props: { ...brief, feedback: { email: 'hello@acme.example', name: null } } });
    expect(r.text).toContain('Something look off? Reply to this email or write to your agency at hello@acme.example.');
  });

  it('hidden when feedback is null', async () => {
    for (const feedback of [null, undefined]) {
      const r = await renderEmail({ template: 'brief', props: { ...brief, feedback } });
      expect(r.text).not.toContain('Something look off?');
    }
  });

  it('PDF variant has no feedback line', async () => {
    const html = await renderBriefDocument({ ...brief, link: null, pdfLink: null, feedback: sam });
    expect(html).not.toContain('Something look off?');
    expect(html).not.toContain('mailto:');
  });
});

describe('trend report', () => {
  const report: TrendReportEmailProps = {
    branding, recipientName: null, clientName: 'A1 HVAC', quarter: '2026-Q3', link: 'https://app.example/l/r', pdfLink: null,
    data: {
      quarter: '2026-Q3', windowDays: 90, businesses: brief.trend!.businesses, eventsByType: { price_change: 3, ad_started: 5 },
      moves: [{ moveType: 'price_war', competitorName: 'Smith HVAC', status: 'active', firstDetectedAt: '2026-08-12' }],
      briefsSent: 12, alertsDelivered: 4, recommendations: { created: 9, done: 3, inProgress: 2, dismissed: 1 },
    },
  };
  it('renders the deterministic numbers as tables', async () => {
    const r = await renderEmail({ template: 'trend_report', props: report });
    expect(r.subject).toBe('A1 HVAC: competitor trends for 2026-Q3');
    for (const s of ['Price change: 3', 'New ads: 5', '12', 'Price war', 'Smith HVAC', '3 done']) expect(r.text).toContain(s);
    expect(r.text).not.toMatch(/price_change|ad_started/);
    expect(await renderTrendReportDocument({ ...report, link: null })).toContain('@page');
  });
});
