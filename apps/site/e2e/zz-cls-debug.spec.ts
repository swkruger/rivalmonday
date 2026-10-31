import { test } from '@playwright/test';
import { mockApp } from './helpers';

// Temporary: names the elements behind each layout shift. Never committed.
for (const path of ['/', '/pricing', '/compare']) {
  test(`cls ${path}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'phone', 'phone only');
    await mockApp(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __s: unknown[] };
      w.__s = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Element | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
          w.__s.push({
            t: Math.round(e.startTime),
            v: Number(e.value.toFixed(4)),
            input: e.hadRecentInput,
            sources: e.sources.map((s) => ({
              node: s.node ? `${s.node.nodeName}.${String((s.node as Element).className).slice(0, 70)} "${(s.node.textContent ?? '').trim().slice(0, 40)}"` : null,
              from: [Math.round(s.previousRect.y), Math.round(s.previousRect.height)],
              to: [Math.round(s.currentRect.y), Math.round(s.currentRect.height)],
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const shifts = await page.evaluate(() => (window as unknown as { __s: unknown[] }).__s);
    console.log(`CLS ${path} ${JSON.stringify(shifts, null, 1)}`);
  });
}
