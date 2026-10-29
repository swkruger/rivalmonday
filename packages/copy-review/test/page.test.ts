import { describe, expect, it } from 'vitest';
import { buildView } from '../src/server/app.js';
import { PAGE_SIZE, pickGroupRefs, quickSignable, renderPage, vscodeLink, type GroupRow } from '../src/server/page.js';
import type { ItemStatus, StatusedItem } from '../src/types.js';

const si = (o: Partial<StatusedItem> = {}): StatusedItem => ({
  surface: 'help', file: 'apps/web/src/help/a.ts', line: 3, anchor: 'a#0', context: 'tip.title', text: 'Hello',
  hash: 'a'.repeat(16), kind: 'string', status: 'unsigned', needsEdit: false, comments: [], ...o,
});

function page(items: StatusedItem[], status: ItemStatus[] = ['unsigned', 'changed'], extra: { page?: number; q?: string } = {}) {
  const v = buildView(items, { status, ...(extra.q ? { q: extra.q } : {}) });
  return renderPage({ ...v, root: 'E:/repo', page: extra.page });
}

/** Labels of every group button, in document order. */
const groupLabels = (html: string) =>
  [...html.matchAll(/<button[^>]*class="group-sign"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]!);

const row = (o: Partial<GroupRow> = {}): GroupRow => ({ file: 'a.ts', hash: 'a'.repeat(16), status: 'unsigned', open: true, ...o });

describe('renderPage', () => {
  it('escapes item text (<script> renders inert)', () => {
    const evil = '<script>alert(1)</script>';
    const html = page([
      si({
        text: evil, context: '<img src=x onerror=alert(2)>', file: 'a"b.ts', needsEdit: true,
        comments: [{
          type: 'comment', file: 'a"b.ts', hash: 'a'.repeat(16), anchor: 'a#0', text: evil, at: '2026-10-29',
          by: '<script>by()</script>', comment: '<script>c()</script>', suggestion: '<script>s()</script>',
        }],
      }),
      si({ file: '<script>f()</script>.ts', hash: 'e'.repeat(16) }),
    ]);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    for (const bad of ['<script>by()', '<script>c()', '<script>s()', '<script>f()']) expect(html).not.toContain(bad);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;by()&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;c()&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;s()&lt;/script&gt;');
    expect(html).toContain('a&quot;b.ts');
    // Group-sign payloads are built from each row's data-file / data-hash.
    expect(html).toContain('data-file="&lt;script&gt;f()&lt;/script&gt;.ts"');
    // Only the page's own inline script.
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  it('changed item shows del/ins', () => {
    const html = page([si({ status: 'changed', text: 'Sign in now', signedText: 'Log in now' })]);
    expect(html).toContain('<del>Log</del>');
    expect(html).toContain('<ins>Sign</ins>');
    expect(html).toMatch(/class="chip chip-changed"/);
  });

  it('group header shows count of shown items', () => {
    const items = [
      si(),
      si({ hash: 'b'.repeat(16), text: 'Two', anchor: 'a#1' }),
      si({ hash: 'c'.repeat(16), text: 'Signed one', anchor: 'a#2', status: 'signed' }),
      si({ file: 'apps/web/src/help/b.ts', hash: 'd'.repeat(16), text: 'Other file' }),
    ];
    // Default filter: the signed row is not shown. surface (3), file a (2), file b (1).
    expect(groupLabels(page(items))).toEqual(['Sign all shown (3)', 'Sign all shown (2)', 'Sign all shown (1)']);
    // Shown but already signed rows are never counted.
    const all = page(items, ['unsigned', 'changed', 'signed']);
    expect(all).toContain('>Signed one<');
    expect(groupLabels(all)).toEqual(['Sign all shown (3)', 'Sign all shown (2)', 'Sign all shown (1)']);
    expect(page([si({ status: 'signed' })], ['signed'])).toMatch(/class="group-sign" data-n="0" disabled>Sign all shown \(0\)/);
    expect(all).toContain('<details class="file" open');
  });

  it('surface sign skips rows in collapsed files', () => {
    const rows = [
      row(),
      row({ file: 'b.ts', hash: 'b'.repeat(16), open: false }),
      row({ file: 'c.ts', hash: 'c'.repeat(16), status: 'changed' }),
    ];
    expect(pickGroupRefs(rows)).toEqual({
      n: 2,
      refs: [{ file: 'a.ts', hash: 'a'.repeat(16) }, { file: 'c.ts', hash: 'c'.repeat(16) }],
    });
    expect(pickGroupRefs([row({ open: false })])).toEqual({ n: 0, refs: [] });
  });

  it('group sign skips rows already signed in place', () => {
    const rows = [
      row(),
      row({ hash: 'b'.repeat(16), status: 'signed' }),
      row({ hash: 'c'.repeat(16), status: 'ignored' }),
      row({ hash: 'd'.repeat(16) }),
      row({ hash: 'd'.repeat(16) }), // same (file, hash) twice: counted twice, posted once
    ];
    expect(pickGroupRefs(rows)).toEqual({
      n: 3,
      refs: [{ file: 'a.ts', hash: 'a'.repeat(16) }, { file: 'a.ts', hash: 'd'.repeat(16) }],
    });
    // The page script runs this exact picker over live row state and open file groups, and posts its refs.
    const html = page([si()]);
    expect(html).toContain('const pickGroupRefs = function pickGroupRefs(rows)');
    expect(html).toContain("open: r.closest('details.file').open");
    expect(html).toContain('items: pick.refs');
  });

  it('keyboard s signs only unsigned / changed rows (never ignored or signed)', () => {
    expect(['unsigned', 'changed', 'signed', 'ignored'].map((s) => quickSignable(s))).toEqual([true, true, false, false]);
    const html = page([si()]);
    expect(html).toContain('const quickSignable = function quickSignable(status)');
    expect(html).toContain('if (quickSignable(rows[cur].dataset.status))');
  });

  it('unticking every status box round-trips to "all" (hidden sentinel)', () => {
    expect(page([si()])).toMatch(/<form class="filters"[^>]*>\s*<input type="hidden" name="status" value="">/);
  });

  it('email item has sandboxed iframe', () => {
    const html = page([
      si({
        surface: 'emails', file: 'packages/email/previews/welcome', anchor: 'email:welcome', kind: 'email',
        text: 'Subject: Welcome aboard\n\nHi there', html: '<p>x</p>', context: 'Welcome',
      }),
    ]);
    const iframe = /<iframe[^>]*>/.exec(html)![0];
    expect(iframe).toMatch(/\ssandbox(\s|>|="")/);
    expect(iframe).not.toMatch(/allow-/);
    expect(iframe).toContain('data-src="/preview/welcome"');
    expect(iframe).toContain('loading="lazy"');
    // Collapsed by default: inside a closed <details>.
    expect(html).toMatch(/<details class="preview">\s*<summary>/);
    expect(html).toContain('Welcome aboard');
    expect(html).toContain('Hi there');
    // The preview HTML itself is never inlined into the page.
    expect(html).not.toContain('<p>x</p>');
  });

  it('paginates and shows the total; links keep the filter', () => {
    const items = Array.from({ length: PAGE_SIZE + 5 }, (_, n) =>
      si({ hash: n.toString(16).padStart(16, '0'), text: `Item ${n}`, anchor: `a#${n}` }),
    );
    const p1 = page(items, ['unsigned'], { q: 'Item' });
    expect(p1).toContain(`1–${PAGE_SIZE} of ${PAGE_SIZE + 5}`);
    expect(p1).toContain('>Item 0<');
    expect(p1).not.toContain(`>Item ${PAGE_SIZE}<`);
    expect(p1).toMatch(/href="\?status=unsigned&amp;q=Item&amp;page=2"/);
    const p2 = page(items, ['unsigned'], { page: 2, q: 'Item' });
    expect(p2).toContain(`>Item ${PAGE_SIZE}<`);
    expect(p2).not.toContain('>Item 0<');
    expect(p2).toContain(`${PAGE_SIZE + 1}–${PAGE_SIZE + 5} of ${PAGE_SIZE + 5}`);
    // Out of range → last page.
    expect(page(items, ['unsigned'], { page: 99, q: 'Item' })).toContain(`>Item ${PAGE_SIZE + 4}<`);
  });

  it('row has vscode link, actions and data attributes', () => {
    const html = page([si({ file: 'apps/web/src/a b.ts', line: 12 })]);
    expect(html).toContain(`href="${vscodeLink('E:/repo', 'apps/web/src/a b.ts', 12)}"`);
    expect(vscodeLink('E:\\repo', 'apps/web/src/a b.ts', 12)).toBe('vscode://file/E:/repo/apps/web/src/a%20b.ts:12');
    expect(html).toMatch(/data-act="sign"/);
    expect(html).toMatch(/data-act="ignore"/);
    expect(html).toMatch(/data-act="comment"/);
  });
});
