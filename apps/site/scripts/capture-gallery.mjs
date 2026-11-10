/**
 * Photographs the five gallery pictures from the sample client tour (`#client-view`) of a running site build.
 * Usage: `node scripts/capture-gallery.mjs [--base http://localhost:3011] [--path /agencies] [--quality 80]`
 * Writes `public/sample/gallery-<id>.webp` (1440x900) and `gallery-<id>-720.webp` (720x450) and prints each size.
 * Exits 1 with the slide id when a control is missing or the clip is not 1440x900. Never generated at runtime (PB2).
 */
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = arg('base', 'http://localhost:3011');
const path = arg('path', '/agencies');
const quality = Number(arg('quality', '80'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sample');

// Each slide: the tab to open, then (dashboard only) the side-menu entry.
const SLIDES = [
  { id: 'dashboard', tab: 'Dashboard', menu: 'Overview' },
  { id: 'brief', tab: 'Monday brief' },
  { id: 'map', tab: 'Dashboard', menu: 'Map rankings' },
  { id: 'ads', tab: 'Dashboard', menu: 'Ads' },
  { id: 'friday', tab: 'Friday' },
];

const fail = (id, why) => {
  console.error(`capture-gallery: ${id}: ${why}`);
  process.exitCode = 1;
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '[data-note-mark]{display:none !important} header.sticky{display:none !important}' });
  const view = page.locator('#client-view');
  const frame = view.locator('.product-frame');
  await frame.scrollIntoViewIfNeeded();
  for (const s of SLIDES) {
    try {
      await view.getByRole('tab', { name: s.tab, exact: true }).click({ timeout: 5000 });
      if (s.menu) await view.getByRole('navigation', { name: /Client menu/ }).getByRole('button', { name: s.menu, exact: true }).click({ timeout: 5000 });
    } catch {
      fail(s.id, `control not found (${s.tab}${s.menu ? ' / ' + s.menu : ''})`);
      continue;
    }
    await frame.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY));
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = [...document.querySelectorAll('#client-view .product-frame img')].filter((i) => i.offsetParent !== null);
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    await page.waitForTimeout(400);
    const box = await frame.boundingBox();
    if (!box) { fail(s.id, 'product frame has no box'); continue; }
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: 960, height: 600 } });
    const big = sharp(png);
    const meta = await big.metadata();
    if (meta.width !== 1440 || meta.height !== 900) { fail(s.id, `clip is ${meta.width}x${meta.height}, not 1440x900`); continue; }
    const files = [
      [join(out, `gallery-${s.id}.webp`), big.clone()],
      [join(out, `gallery-${s.id}-720.webp`), big.clone().resize(720, 450)],
    ];
    for (const [file, img] of files) {
      const info = await img.webp({ quality }).toFile(file);
      console.log(`${s.id.padEnd(9)} ${basename(file).padEnd(26)} ${info.width}x${info.height} ${(info.size / 1024).toFixed(1)} KB`);
    }
  }
} finally {
  await browser.close();
}
