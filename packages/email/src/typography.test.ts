import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextOn, resolveBranding } from './branding';
import { EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';

/** Owner, 2026-11-02: email text was too small. Body 16 px, nothing under 14 px, button label 16 px and readable on the brand colour. */
const sizes = (html: string) => [...html.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));

describe('email typography', () => {
  it('body text is 16 px with a 24 px line height', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { branding: resolveBranding('Rival Monday', null), url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const p = out.html.match(/<p[^>]*>This invitation is from the Rival Monday team\.<\/p>/)?.[0] ?? '';
    expect(p).toMatch(/font-size:16px/);
    expect(p).toMatch(/line-height:24px/);
  });

  it.each(EMAIL_PREVIEWS.map((p) => [p.id, p] as const))('%s: no text under 14 px', async (_id, p) => {
    const out = await renderEmail(p.payload);
    expect(Math.min(...sizes(out.html))).toBeGreaterThanOrEqual(14);
  });

  it('button label is 16 px and readable on the default primary (ink on #47A8E7)', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { branding: resolveBranding('Rival Monday', null), url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const a = out.html.match(/<a[^>]*href="https:\/\/x\.test\/j"[^>]*>/)?.[0] ?? '';
    expect(a).toMatch(/font-size:16px/);
    expect(a.toLowerCase()).toMatch(/color:#0b2540/);
  });

  it('button label is white on a dark agency primary', async () => {
    const branding = resolveBranding('Acme', { primary: '#1D3557' });
    const out = await renderEmail({ template: 'agency_invite', props: { branding, url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const a = out.html.match(/<a[^>]*href="https:\/\/x\.test\/j"[^>]*>/)?.[0] ?? '';
    expect(a.toLowerCase()).toMatch(/color:#ffffff/);
  });

  // Owner, 2026-11-03: a delivered quiet-week brief still read small and narrow; 6-column scorecard headers ran together.
  const preview = (id: string) => EMAIL_PREVIEWS.find((p) => p.id === id)!.payload;
  const maxWidth = (html: string) => html.match(/max-width:\s*(\d+)px/)?.[1];

  it.each(['brief', 'brief.quiet_scorecard', 'brief.starting_point', 'alert_digest', 'trend_report'])('%s: wide 760 px container', async (id) => {
    expect(maxWidth((await renderEmail(preview(id))).html)).toBe('760');
  });

  it.each(['sign_in', 'agency_invite.pilot', 'client_invite'])('%s: transactional email keeps the 640 px container', async (id) => {
    expect(maxWidth((await renderEmail(preview(id))).html)).toBe('640');
  });

  it.each(['brief', 'brief.quiet_scorecard', 'brief.starting_point'])('%s: table data cells are 16 px', async (id) => {
    const html = (await renderEmail(preview(id))).html;
    // Data tables are the ones with a header row (react-email's Section is a table too, without one).
    const rows = [...html.matchAll(/<\/thead><tbody[^>]*>([\s\S]*?)<\/tbody>/g)].map((m) => m[1]!);
    const tds = rows.flatMap((b) => [...b.matchAll(/<td[^>]*style="([^"]*)"/g)].map((m) => m[1]!));
    expect(tds.length).toBeGreaterThan(0);
    for (const style of tds) expect(style).toMatch(/font-size:16px/);
  });

  it('scorecard headers wrap inside their cell and numeric columns keep a gap', async () => {
    const p = preview('brief.quiet_scorecard');
    if (p.template !== 'brief') throw new Error('fixture');
    const headers = ['Business', 'Rating', 'Reviews 90 d', 'Reply rate', 'Map top-3', 'Google ads', 'Meta ads'];
    const scorecard = { ...p.props.scorecard!, table: { headers, rows: [{ cells: ['Bright Smile Dental (you)', '4.6', '12', '50%', '31%', '2', '—'], self: true, tier: null }] } };
    const html = (await renderEmail({ template: 'brief', props: { ...p.props, scorecard } })).html;
    const table = html.match(/<table[^>]*aria-label="Scorecard[\s\S]*?<\/table>/)?.[0] ?? '';
    const ths = [...table.matchAll(/<th[^>]*style="([^"]*)"/g)].map((m) => m[1]!);
    expect(ths).toHaveLength(headers.length);
    for (const style of ths) {
      expect(style).not.toMatch(/white-space:nowrap/);
      expect(style).toMatch(/white-space:normal/);
      expect(style).toMatch(/padding-left:\d+px|padding:\d+px \d+px/);
    }
    expect(table).toMatch(/table-layout:fixed/);
  });

  it('scorecard numbers never split mid-number and headers only wrap at spaces', async () => {
    const p = preview('brief.quiet_scorecard');
    if (p.template !== 'brief') throw new Error('fixture');
    const headers = ['Business', 'Rating', 'Reviews 90 d', 'Reply rate', 'Map top-3', 'Google ads', 'Meta ads'];
    const scorecard = { ...p.props.scorecard!, table: { headers, rows: [{ cells: ['Bright Smile Dental (you)', '4.6', '12', '50%', '31%', '2', '—'], self: true, tier: null }] } };
    const html = (await renderEmail({ template: 'brief', props: { ...p.props, scorecard } })).html;
    const table = html.match(/<table[^>]*aria-label="Scorecard[\s\S]*?<\/table>/)?.[0] ?? '';
    const tds = [...table.matchAll(/<td[^>]*style="([^"]*)"/g)].map((m) => m[1]!);
    expect(tds).toHaveLength(headers.length);
    for (const style of tds.slice(1)) expect(style).toMatch(/white-space:nowrap/);
    for (const m of table.matchAll(/<th[^>]*style="([^"]*)"/g)) expect(m[1]).not.toMatch(/break-word/);
  });

  it('the scorecard shows short headers that fit a phone, with a key under the table', async () => {
    const p = preview('brief.quiet_scorecard');
    if (p.template !== 'brief') throw new Error('fixture');
    const headers = ['Business', 'Rating', 'Reviews 90 d', 'Reply rate', 'Map top-3', 'Google ads', 'Meta ads'];
    const scorecard = { ...p.props.scorecard!, table: { headers, rows: [{ cells: ['Bright Smile Dental (you)', '4.6', '12', '50%', '31%', '2', '—'], self: true, tier: null }] } };
    const html = (await renderEmail({ template: 'brief', props: { ...p.props, scorecard } })).html;
    const table = html.match(/<table[^>]*aria-label="Scorecard[\s\S]*?<\/table>/)?.[0] ?? '';
    const ths = [...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(ths).toEqual(['Business', 'Stars', 'New', 'Reply', 'Top 3', 'G ads', 'M ads']);
    expect(html).toContain('New: reviews in the last 90 days · Reply: reply rate · Top 3: share of top-3 map spots · G ads / M ads: active Google and Meta ads');
  });

  it('readableTextOn picks the higher-contrast label', () => {
    expect(readableTextOn('#47A8E7')).toBe('#0B2540');
    expect(readableTextOn('#000000')).toBe('#FFFFFF');
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
});
