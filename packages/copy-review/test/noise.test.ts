import { describe, expect, it } from 'vitest';
import { isCopyLike } from '../src/scan/filters.js';
import { scanTsFile } from '../src/scan/ts-scan.js';

const mod = (src: string) => scanTsFile('fx/m.ts', src, { surface: 'help', mode: 'module' }).map((i) => i.text);
const jsx = (src: string) => scanTsFile('fx/p.tsx', src, { surface: 'app-client', mode: 'jsx' }).map((i) => i.text);

describe('noise pass (Task 4)', () => {
  it('collapses consecutive placeholders from ternary / && children into one {…}', () => {
    const src = "export const P = () => <p>{`Tracking ${n} competitor${n === 1 ? '' : 's'}${z > 0 ? ` across ${z} ZIP codes` : ''}${d ? ` · ${x}` : ''}`}</p>;";
    const t = jsx(src);
    expect(t).toContain('Tracking {n} competitor{…}');
    expect(t.some((s) => s.includes('{…}{…}'))).toBe(false);
    expect(mod("export const a = { b: `${x ? 'A' : ''}${y ? 'B' : ''} set` };")).toEqual(['{…} set']);
    // Separated placeholders stay separate.
    expect(mod("export const a = { b: `moved ${a ? 'up' : 'down'} ${n ? 'far' : ''} today` };")).toEqual(['moved {…} {…} today']);
  });

  it('drops strings logged through any logger root (this.logger, deps.logger, log, ctx.log)', () => {
    const src = `export const o = { run: () => {
      this.logger.warn('Cache Miss happened');
      deps.logger.info({ a: 1 }, 'Job Done here');
      log.error('Failed to send');
      ctx.log.debug('Started the thing');
      logger.child({ m: 1 }).info('Child said this');
      return 'Kept sentence.';
    } };`;
    expect(mod(src)).toEqual(['Kept sentence.']);
  });

  it('drops new Error(...) messages wherever they appear, not only when thrown', () => {
    const src = `export const o = {
      a: () => Promise.reject(new Error('Not Found Here')),
      b: () => { const e = new TypeError('Bad Input value'); return e; },
      c: { message: 'Something went wrong.' },
    };
    export function f() { return cb(new Error('Upload Failed')); }`;
    expect(mod(src)).toEqual(['Something went wrong.']);
  });

  it('drops literals used only in comparisons, case labels and .includes() inside property functions', () => {
    const src = `export const COPY = {
      status: (s: string) => {
        if (s === 'Active' || s !== 'Paused Now') return 'It is running.';
        switch (s) { case 'Draft': return 'Not sent yet.'; default: break; }
        if (['A', 'B'].includes('Pending Review')) return 'Waiting.';
        return s == 'Other Thing' ? 'Other.' : 'Unknown.';
      },
    };`;
    expect(mod(src)).toEqual(['It is running.', 'Not sent yet.', 'Waiting.', 'Other.', 'Unknown.']);
  });

  it('drops a lone ALL-CAPS token unless it is a known UI word', () => {
    for (const bad of ['UTC', 'POST', 'GET', 'USD']) expect([bad, isCopyLike(bad)]).toEqual([bad, false]);
    for (const ok of ['OK', 'URL', 'AI', 'MCP', 'MRR', 'WAU', 'HVAC', 'Ask', 'UTC time']) expect([ok, isCopyLike(ok)]).toEqual([ok, true]);
    expect(mod("export const d = { tz: 'UTC', label: 'Trial ends' };")).toEqual(['Trial ends']);
  });

  it('needs a letter outside {placeholders}', () => {
    for (const bad of ['{lat}, {lng}', '{n} {…}', '{competitorName}:', ' · {agencyName}', '%s · {SITE_NAME}']) expect([bad, isCopyLike(bad)]).toEqual([bad, false]);
    for (const ok of ['{n} stars', 'Ask {assistant}', '{name} is ready.']) expect([ok, isCopyLike(ok)]).toEqual([ok, true]);
  });

  it('treats class strings with placeholders as CSS', () => {
    expect(mod('const selectClass = `${nativeSelectClass} w-full max-w-sm`;')).toEqual([]);
    expect(isCopyLike('{base} w-32')).toBe(false);
    // A word ending in a colon is not a Tailwind variant.
    expect(isCopyLike('removed: {text}')).toBe(true);
  });

  it('drops rel values and anything inside a style={{…}} attribute', () => {
    expect(mod("export const C = { a: { rel: 'noopener noreferrer', title: 'Open it' } };")).toEqual(['Open it']);
    expect(jsx("export const P = () => <div style={{ fontFamily: 'Inter', color: 'Dark Blue' }}>Hello there</div>;")).toEqual(['Hello there']);
  });

  it('drops media queries, cookie attribute strings and arbitrary-variant class lists', () => {
    for (const bad of ['(min-width: 1024px)', '(max-width: 640px)', 'path=/; max-age=2592000; samesite=lax', '; Secure',
      "border bg-surface hover:bg-canvas [&_svg:not([class*='text-'])]:text-muted-ink"]) expect([bad, isCopyLike(bad)]).toEqual([bad, false]);
    for (const ok of ['(opens in a new tab)', 'Secure your account.', 'Path to the page']) expect([ok, isCopyLike(ok)]).toEqual([ok, true]);
  });

  it('decodes HTML entities in JSX text and attributes', () => {
    const t = jsx('export const P = () => <p title="Don&apos;t go">It can&apos;t be changed &mdash; ever &amp; always&#33;</p>;');
    expect(t).toContain("Don't go");
    expect(t).toContain("It can't be changed — ever & always!");
  });
});
