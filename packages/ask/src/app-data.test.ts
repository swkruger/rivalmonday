import { describe, expect, it } from 'vitest';
import { type AppDatum, appLinkPath, collectAppData, withAppPaths } from './app-data';

const C = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const E = '33333333-3333-4333-8333-333333333333';

describe('appLinkPath', () => {
  it('keeps app paths, strips the origin of absolute links, refuses everything else', () => {
    expect(appLinkPath('/c/x/changes?event=1')).toBe('/c/x/changes?event=1');
    expect(appLinkPath('https://app.example.com/c/x/moves')).toBe('/c/x/moves');
    expect(appLinkPath('//evil.example/x')).toBeNull();
    expect(appLinkPath('javascript:alert(1)')).toBeNull();
    expect(appLinkPath('not a url')).toBeNull();
  });
});

describe('collectAppData', () => {
  it('a competitor profile is citable by competitorId and opens the competitor page', () => {
    const out = new Map<string, AppDatum>();
    collectAppData({ competitorId: P, name: 'Aire Serv', activeAds: { google: 85, meta: 21 }, openMoves: 1 }, C, out);
    const d = out.get(`app:${P}`)!;
    expect(d.path).toBe(`/c/${C}/competitors/${P}`);
    expect(d.text).toContain('"google":85');
  });
  it('rows with an id and url are citable; their link and evidence ids are not part of the text', () => {
    const out = new Map<string, AppDatum>();
    collectAppData({ items: [{ id: E, title: 'Aire Serv: new ad', url: `https://app.example.com/c/${C}/changes?event=${E}`, evidenceIds: [P] }] }, C, out);
    const d = out.get(`app:${E}`)!;
    expect(d.path).toBe(`/c/${C}/changes?event=${E}`);
    expect(d.text).toContain('Aire Serv: new ad');
    expect(d.text).not.toContain('https://');
    expect(d.text).not.toContain(P);
  });
  it('a nested competitorId (no url) and a row with an unsafe url are not citable', () => {
    const out = new Map<string, AppDatum>();
    collectAppData({ items: [{ competitorId: P, name: 'x' }, { id: E, url: 'javascript:alert(1)' }] }, C, out);
    expect(out.size).toBe(0);
  });
});

describe('withAppPaths', () => {
  it('appends the page to app: citations only', () => {
    const data = new Map<string, AppDatum>([[`app:${P}`, { text: '{}', path: `/c/${C}/competitors/${P}` }]]);
    expect(withAppPaths([`ev:${E}`, `app:${P}`], data)).toEqual([`ev:${E}`, `app:${P}@/c/${C}/competitors/${P}`]);
  });
});
