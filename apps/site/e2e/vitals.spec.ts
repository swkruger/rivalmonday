import { expect, test } from '@playwright/test';
import { mockApp } from './helpers';

/** Lab check on a throttled phone (slow 4G-ish network, 4x CPU). Real-user vitals come from Vercel Analytics. */
const LCP_MAX_MS = 2500;
const CLS_MAX = 0.1;

for (const path of ['/', '/pricing', '/compare']) {
  test(`vitals ${path}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'phone', 'phone project only');
    await mockApp(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      w.__lcp = 0;
      w.__cls = 0;
      new PerformanceObserver((l) => {
        const e = l.getEntries();
        w.__lcp = e[e.length - 1]!.startTime;
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
    const { lcp, cls } = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      return { lcp: w.__lcp, cls: w.__cls };
    });
    console.log(`VITALS ${path} LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(4)}`);
    info.annotations.push({ type: 'vitals', description: `LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(4)}` });
    expect(lcp, 'LCP reported').toBeGreaterThan(0);
    expect(lcp).toBeLessThanOrEqual(LCP_MAX_MS);
    expect(cls).toBeLessThanOrEqual(CLS_MAX);
  });
}
