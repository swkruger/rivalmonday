import { describe, expect, it } from 'vitest';
import { buildView } from '../src/server/app.js';
import { groupRefs, PAGE_SIZE, renderPage, vscodeLink } from '../src/server/page.js';
import type { ItemStatus, StatusedItem } from '../src/types.js';

const si = (o: Partial<StatusedItem> = {}): StatusedItem => ({
  surface: 'help', file: 'apps/web/src/help/a.ts', line: 3, anchor: 'a#0', context: 'tip.title', text: 'Hello',
  hash: 'a'.repeat(16), kind: 'string', status: 'unsigned', needsEdit: false, comments: [], ...o,
});

function page(items: StatusedItem[], status: ItemStatus[] = ['unsigned', 'changed'], extra: { page?: number; q?: string } = {}) {
  const v = buildView(items, { status, ...(extra.q ? { q: extra.q } : {}) });
  return renderPage({ ...v, root: 'E:/repo', page: extra.page });
}

const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** data-refs of every group button, in document order. */
function groupButtons(html: string) {
  return [...html.matchAll(/<button[^>]*class="group-sign"[^>]*data-refs="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map((m) => ({
    refs: JSON.parse(unesc(m[1]!)) as { file: string; hash: string }[],
    label: m[2]!,
  }));
}

describe('renderPage', () => {
  it('escapes item text (<script> renders inert)', () => {
    const html = page([si({ text: '<script>alert(1)</script>', context: '<img src=x onerror=alert(2)>', file: 'a"b.ts' })]);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a&quot;b.ts');
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
    const html = page(items);
    const groups = groupButtons(html);
    // surface header (help: 3 shown), file a (2 shown; the signed one is filtered out), file b (1).
    expect(groups.map((g) => g.label)).toEqual(['Sign all shown (3)', 'Sign all shown (2)', 'Sign all shown (1)']);
    expect(groups[1]!.refs).toEqual([
      { file: 'apps/web/src/help/a.ts', hash: 'a'.repeat(16) },
      { file: 'apps/web/src/help/a.ts', hash: 'b'.repeat(16) },
    ]);
    expect(groups[0]!.refs).toHaveLength(3);
    expect(groups[0]!.refs).not.toContainEqual({ file: 'apps/web/src/help/a.ts', hash: 'c'.repeat(16) });
    expect(html).toContain('<details class="file" open');
  });

  it('group payload is exactly the shown rows (file, hash), deduplicated', () => {
    const a = si();
    expect(groupRefs([a, si({ line: 9 }), si({ hash: 'b'.repeat(16) })])).toEqual([
      { file: a.file, hash: 'a'.repeat(16) },
      { file: a.file, hash: 'b'.repeat(16) },
    ]);
    // The page script posts the button's data-refs as-is.
    expect(page([a])).toMatch(/JSON\.parse\(btn\.dataset\.refs\)/);
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
