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

  it('renders a print document without email-only links', async () => {
    const html = await renderBriefDocument({ ...brief, link: null, pdfLink: null });
    expect(html).toContain('@page');
    expect(html).not.toContain('https://app.example/l/pdf');
    expect(html).toContain('Headline 2');
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
    for (const s of ['price_change', '12', 'Price war', 'Smith HVAC', '3 done']) expect(r.text).toContain(s);
    expect(await renderTrendReportDocument({ ...report, link: null })).toContain('@page');
  });
});
