import { expect, test } from '@playwright/test';
import { mockApp } from './helpers';

/** Lab check on a throttled phone (slow 4G-ish network, 4x CPU). Real-user vitals are not collected: Vercel Analytics counts page views only (Speed Insights is not installed). */
const LCP_MAX_MS = 2500;
const CLS_MAX = 0.1;

for (const path of ['/', '/agencies', '/business', '/agencies/pricing', '/business/pricing', '/compare']) {
  test(`vitals ${path}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'phone', 'phone project only');
    await mockApp(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number; __lcpEl: string };
      w.__lcp = 0;
      w.__cls = 0;
      w.__lcpEl = '';
      new PerformanceObserver((l) => {
        const e = l.getEntries();
        const last = e[e.length - 1] as PerformanceEntry & { element?: Element | null };
        w.__lcp = last.startTime;
        // What the browser painted last as the largest element: tag, id and picture (or the first words of a text block).
        const el = last.element;
        w.__lcpEl = el
          ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${(el as HTMLImageElement).currentSrc ? ' src=' + (el as HTMLImageElement).currentSrc : ' "' + (el.textContent ?? '').trim().slice(0, 40) + '"'}`
          : 'none';
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!e.hadRecentInput) w.__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const { lcp, cls, lcpEl } = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number; __lcpEl: string };
      return { lcp: w.__lcp, cls: w.__cls, lcpEl: w.__lcpEl };
    });
    console.log(`VITALS ${path} LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(4)} element=${lcpEl}`);
    info.annotations.push({ type: 'vitals', description: `LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(4)} element=${lcpEl}` });
    expect(lcp, 'LCP reported').toBeGreaterThan(0);
    expect(lcp).toBeLessThanOrEqual(LCP_MAX_MS);
    expect(cls).toBeLessThanOrEqual(CLS_MAX);
  });
}
