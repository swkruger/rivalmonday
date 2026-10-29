import { wordDiff } from '../diff.js';
import { SURFACES, type ItemStatus, type StatusedItem, type Surface } from '../types.js';
import type { Counts, ViewFilter } from './app.js';

/** Rows per page: 5,800 items at once would make the page slow; the filter stays in every link. */
export const PAGE_SIZE = 300;

export interface PageView {
  items: StatusedItem[];
  counts: Record<Surface, Counts>;
  filter: ViewFilter;
  root: string;
  /** 1-based; clamped to the available pages. */
  page?: number;
}

/** The one HTML escaper: every piece of item text, attribute value and URL goes through it. */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (n: number) => n.toLocaleString('en-US');
const STATUS_ORDER: ItemStatus[] = ['unsigned', 'changed', 'signed', 'ignored'];
const CHIP: Record<ItemStatus, string> = {
  unsigned: '○ Unsigned', changed: '△ Changed', signed: '✓ Signed', ignored: '– Ignored',
};

/** One row as the group-sign picker sees it: its ref, live status, and whether its file group is expanded. */
export interface GroupRow { file: string; hash: string; status: string; open: boolean }
export interface GroupPick { n: number; refs: { file: string; hash: string }[] }

/**
 * Ruling R7: a group sign covers only rows the owner can see (file group expanded) that still need a signature
 * (unsigned / changed, live status). `n` = matching rows; `refs` = their (file, hash), in order, deduplicated.
 * Kept as plain-JS source so the page script runs exactly the function the tests exercise.
 */
const PICK_SRC = `function pickGroupRefs(rows) {
  var seen = new Set();
  var refs = [];
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.open || (r.status !== 'unsigned' && r.status !== 'changed')) continue;
    n++;
    var k = r.file + '\\u0000' + r.hash;
    if (!seen.has(k)) {
      seen.add(k);
      refs.push({ file: r.file, hash: r.hash });
    }
  }
  return { n: n, refs: refs };
}`;
export const pickGroupRefs = new Function(`return ${PICK_SRC}`)() as (rows: GroupRow[]) => GroupPick;

/** `vscode://file/<abs path>:<line>` with forward slashes and a URL-safe path. */
export function vscodeLink(root: string, file: string, line: number): string {
  const path = `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${file}`;
  const enc = encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `vscode://file${path.startsWith('/') ? '' : '/'}${enc}:${line}`;
}

/** Query string for a filter (status kept explicit so "all" survives: `status=` means every status). */
function qs(f: ViewFilter, page?: number, surface: Surface | undefined | null = f.surface): string {
  const parts: string[] = [];
  if (surface) parts.push(`surface=${encodeURIComponent(surface)}`);
  const st = f.status ?? [];
  if (st.join(',') !== 'unsigned,changed') parts.push(`status=${st.join(',')}`);
  if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
  if (page && page > 1) parts.push(`page=${page}`);
  return parts.length ? `?${parts.join('&')}` : '?';
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** Initial label (all file groups start open); the page script recomputes it live with pickGroupRefs. */
function groupButton(items: StatusedItem[]): string {
  const { n } = pickGroupRefs(items.map((i) => ({ file: i.file, hash: i.hash, status: i.status, open: true })));
  return `<button type="button" class="group-sign" data-n="${n}"${n === 0 ? ' disabled' : ''}>Sign all shown (${fmt(n)})</button>`;
}

function textHtml(i: StatusedItem, text: string, signedText?: string): string {
  if (i.status === 'changed' && signedText !== undefined) {
    const parts = wordDiff(signedText, text).map((p) =>
      p.op === 'eq' ? esc(p.text) : p.op === 'add' ? `<ins>${esc(p.text)}</ins>` : `<del>${esc(p.text)}</del>`,
    );
    return `<div class="text diff" title="Changed since signed">${parts.join(' ')}</div>`;
  }
  return `<div class="text">${esc(text)}</div>`;
}

/** Email: "Subject: …\n\n<plain text>"; preview id from the anchor `email:<id>` / `document:<id>`. */
function previewHtml(i: StatusedItem): string {
  const id = i.anchor.replace(/^(email|document):/, '');
  let body = i.text;
  let signed = i.signedText;
  let subject = '';
  if (i.kind === 'email') {
    const m = /^Subject: (.*)\n\n?([\s\S]*)$/.exec(i.text);
    if (m) {
      subject = m[1]!;
      body = m[2]!;
      const sm = signed !== undefined ? /^Subject: (.*)\n\n?([\s\S]*)$/.exec(signed) : null;
      if (sm) signed = sm[2]!;
    }
  }
  return [
    subject ? `<div class="subject"><span class="label">Subject</span> ${esc(subject)}</div>` : '',
    `<details class="preview">
<summary>Show rendered ${i.kind === 'email' ? 'email' : 'document'}</summary>
<iframe sandbox loading="lazy" data-src="/preview/${esc(encodeURIComponent(id))}" title="${esc(`Preview: ${i.context}`)}"></iframe>
</details>`,
    `<div class="plain">${textHtml(i, body, signed)}</div>`,
  ].join('\n');
}

function rowHtml(i: StatusedItem, root: string): string {
  const preview = i.kind === 'email' || i.kind === 'document';
  const source = preview
    ? `<a class="src" href="/preview/${esc(encodeURIComponent(i.anchor.replace(/^(email|document):/, '')))}" target="_blank" rel="noopener">${esc(i.file)}</a>`
    : `<a class="src" href="${esc(vscodeLink(root, i.file, i.line))}" title="Open in VS Code">${esc(i.file)}:${i.line}</a>`;
  const comments = i.comments
    .filter((c) => !c.resolved)
    .map(
      (c) =>
        `<li><span class="by">${esc(c.by)} · ${esc(c.at)}</span> ${esc(c.comment)}${
          c.suggestion ? `<div class="suggestion"><span class="label">Suggested</span> ${esc(c.suggestion)}</div>` : ''
        }</li>`,
    )
    .join('');
  return `<article class="row s-${i.status}" tabindex="-1" data-file="${esc(i.file)}" data-hash="${esc(i.hash)}" data-status="${i.status}">
<div class="row-head">
<span class="chip chip-${i.status}" data-chip>${CHIP[i.status]}</span>
<span class="chip chip-needs" data-needs${i.needsEdit ? '' : ' hidden'}>✎ Needs edit</span>
<span class="ctx">${esc(i.context)}</span>
${source}
<span class="actions">
<button type="button" class="btn btn-primary" data-act="sign">${i.status === 'signed' ? 'Unsign' : 'Sign'}</button>
<button type="button" class="btn" data-act="ignore">${i.status === 'ignored' ? 'Unignore' : 'Ignore'}</button>
<button type="button" class="btn" data-act="comment">Comment</button>
</span>
</div>
${preview ? previewHtml(i) : textHtml(i, i.text, i.signedText)}
<ul class="comments">${comments}</ul>
</article>`;
}

function countsFor(counts: Record<Surface, Counts>, s: Surface | '*'): Counts {
  if (s !== '*') return counts[s];
  const t: Counts = { unsigned: 0, changed: 0, signed: 0, ignored: 0, needsEdit: 0 };
  for (const c of Object.values(counts)) for (const k of Object.keys(t) as (keyof Counts)[]) t[k] += c[k];
  return t;
}

/** Sort by surface, then file (first appearance), keeping scan order inside a file. */
function ordered(items: StatusedItem[]): StatusedItem[] {
  const fileFirst = new Map<string, number>();
  items.forEach((i, n) => {
    if (!fileFirst.has(i.file)) fileFirst.set(i.file, n);
  });
  return items
    .map((i, n) => ({ i, n }))
    .sort(
      (a, b) =>
        SURFACES.indexOf(a.i.surface) - SURFACES.indexOf(b.i.surface) ||
        fileFirst.get(a.i.file)! - fileFirst.get(b.i.file)! ||
        a.n - b.n,
    )
    .map((x) => x.i);
}

export function renderPage(view: PageView): string {
  const { filter, counts, root } = view;
  const all = ordered(view.items);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(view.page ?? 1) || 1), pages);
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scope: Surface | '*' = filter.surface ?? '*';
  const sc = countsFor(counts, scope);

  // Sidebar: surfaces with "to do" counts (unsigned + changed); links keep status + search.
  const nav = [
    `<a href="${esc(qs(filter, 1, null))}" class="${filter.surface ? '' : 'on'}"><span>All surfaces</span><span class="count" data-c="*:todo">${fmt(countsFor(counts, '*').unsigned + countsFor(counts, '*').changed)}</span></a>`,
    ...SURFACES.map((s) => {
      const c = counts[s];
      return `<a href="${esc(qs(filter, 1, s))}" class="${filter.surface === s ? 'on' : ''}"><span>${esc(s)}</span><span class="count" data-c="${s}:todo">${fmt(c.unsigned + c.changed)}</span></a>`;
    }),
  ].join('\n');

  const stat = (k: keyof Counts, label: string) =>
    `<div class="stat stat-${k}"><span class="num" data-c="${scope}:${k}">${fmt(sc[k])}</span><span class="label">${label}</span></div>`;

  const checks = STATUS_ORDER.map(
    (s) =>
      `<label class="check"><input type="checkbox" name="status" value="${s}"${filter.status?.includes(s) ? ' checked' : ''}> ${s[0]!.toUpperCase()}${s.slice(1)}</label>`,
  ).join('\n');

  // Items grouped by surface, then file.
  const bySurface = new Map<Surface, Map<string, StatusedItem[]>>();
  for (const i of shown) {
    const files = bySurface.get(i.surface) ?? bySurface.set(i.surface, new Map()).get(i.surface)!;
    (files.get(i.file) ?? files.set(i.file, []).get(i.file)!).push(i);
  }
  const groups = [...bySurface]
    .map(([surface, files]) => {
      const surfaceItems = [...files.values()].flat();
      const fileHtml = [...files]
        .map(
          ([file, items]) => `<details class="file" open>
<summary><span class="path">${esc(file)}</span><span class="n">${plural(items.length, 'item')}</span>${groupButton(items)}</summary>
${items.map((i) => rowHtml(i, root)).join('\n')}
</details>`,
        )
        .join('\n');
      return `<section class="surface">
<div class="surface-head"><h2>${esc(surface)}</h2><span class="n">${plural(surfaceItems.length, 'item')} shown</span>${groupButton(surfaceItems)}</div>
${fileHtml}
</section>`;
    })
    .join('\n');

  const from = all.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + shown.length;
  const pager = `<nav class="pager" aria-label="Pages">
<span>Showing <strong>${fmt(from)}–${fmt(to)} of ${fmt(all.length)}</strong></span>
${page > 1 ? `<a href="${esc(qs(filter, page - 1))}">← Previous</a>` : ''}
${pages > 1 ? `<span class="muted">Page ${page} of ${pages}</span>` : ''}
${page < pages ? `<a href="${esc(qs(filter, page + 1))}">Next →</a>` : ''}
</nav>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copy sign-off</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style>
</head>
<body>
<header class="top">
<h1>Copy sign-off</h1>
<span class="muted">Local review · every signature is written to docs/copy/signoff.json</span>
<span class="keys muted"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>s</kbd> sign · <kbd>c</kbd> comment</span>
</header>
<div class="layout">
<aside class="side"><nav class="nav" aria-label="Surfaces">
${nav}
</nav><p class="muted small">Counts = unsigned + changed.</p></aside>
<main class="sheet">
<div class="band">
${stat('unsigned', 'Unsigned')}
${stat('changed', 'Changed')}
${stat('signed', 'Signed')}
${stat('ignored', 'Ignored')}
${stat('needsEdit', 'Needs edit')}
<div class="scope muted">${filter.surface ? esc(filter.surface) : 'All surfaces'}</div>
</div>
<form class="filters" method="get" action="/">
<input type="hidden" name="status" value="">
${filter.surface ? `<input type="hidden" name="surface" value="${esc(filter.surface)}">` : ''}
<fieldset><legend>Status</legend>
${checks}
</fieldset>
<label class="search"><span class="sr">Search</span><input type="search" name="q" value="${esc(filter.q ?? '')}" placeholder="Search text, context or file"></label>
<button type="submit" class="btn">Apply</button>
</form>
${pager}
${groups || '<p class="empty">Nothing to review with this filter.</p>'}
${pages > 1 ? pager : ''}
</main>
</div>
<template id="comment-tpl"><form class="comment-form">
<label>Comment<textarea name="comment" rows="2" maxlength="5000" required></textarea></label>
<label>Suggested wording (optional)<textarea name="suggestion" rows="2" maxlength="5000"></textarea></label>
<div class="form-actions"><button type="submit" class="btn btn-primary">Save comment</button><button type="button" class="btn" data-cancel>Cancel</button></div>
</form></template>
<div id="flash" class="flash" role="status" hidden></div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const CSS = `
:root{--frame:#F6F9FC;--sheet:#FFFFFF;--ink:#0B2540;--ink2:#334155;--muted:#5B6B80;--line:#E2E8F0;--line2:#EDF1F5;--control:#CBD5E1;
--primary:#47A8E7;--primary-hover:#2F93D6;--selected:#E3F2FC;--link:#1F6FA8;--focus:#2A6BAC;--grey:#EEF2F6}
*{box-sizing:border-box}
body{margin:0;background:var(--frame);color:var(--ink);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--link)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.muted{color:var(--muted)}.small{font-size:12px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
kbd{font:12px/1 Inter,system-ui,sans-serif;border:1px solid var(--control);border-radius:4px;padding:1px 5px;background:var(--sheet)}
.top{max-width:1560px;margin:0 auto;padding:16px 24px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}
.top h1{font-size:18px;font-weight:600;margin:0}
.top .keys{margin-left:auto;font-size:13px}
.layout{max-width:1560px;margin:0 auto 32px;padding:0 24px;display:grid;grid-template-columns:232px minmax(0,1fr);gap:24px;align-items:start}
.side{position:sticky;top:16px}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:6px;color:var(--ink);text-decoration:none}
.nav a:hover{background:var(--grey)}
.nav a.on{background:var(--selected);color:var(--link);font-weight:600}
.count{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
.nav a.on .count{color:var(--link)}
.sheet{background:var(--sheet);border:1px solid var(--line);border-radius:12px;padding:24px;min-width:0}
.band{display:flex;flex-wrap:wrap;gap:8px 32px;align-items:flex-end;background:var(--frame);border:1px solid var(--line2);border-radius:8px;padding:12px 16px}
.stat{display:flex;flex-direction:column}
.stat .num{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.stat .label{font-size:12px;color:var(--muted)}
.stat-changed .num{color:#B45309}.stat-signed .num{color:#166534}.stat-needsEdit .num{color:#92400E}
.band .scope{margin-left:auto;font-size:13px}
.filters{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;margin:16px 0 8px}
.filters fieldset{border:0;margin:0;padding:0;display:flex;gap:12px;align-items:center}
.filters legend{float:left;margin-right:4px;color:var(--muted);font-size:13px}
.check{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
.search input{height:32px;width:min(360px,70vw);border:1px solid #8796AB;border-radius:6px;padding:0 10px;font:inherit}
.btn{height:28px;padding:0 10px;border:1px solid var(--control);background:var(--sheet);color:var(--ink);border-radius:6px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.btn:hover{background:var(--frame)}
.btn-primary{background:var(--primary);border-color:var(--primary);font-weight:600}
.btn-primary:hover{background:var(--primary-hover)}
.filters .btn{height:32px}
.group-sign{height:26px;padding:0 10px;border:1px solid var(--control);background:var(--sheet);color:var(--ink);border-radius:6px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;margin-left:auto}
.group-sign:hover{background:var(--selected);border-color:var(--primary)}
.group-sign:disabled{opacity:.5;cursor:progress}
.pager{display:flex;gap:16px;align-items:center;font-size:13px;margin:8px 0 16px}
.surface{margin-top:24px}
.surface-head{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding-bottom:8px}
.surface-head h2{font-size:16px;font-weight:600;margin:0}
.n{color:var(--muted);font-size:13px}
details.file{border-bottom:1px solid var(--line2)}
details.file>summary{display:flex;align-items:center;gap:12px;padding:10px 0;cursor:pointer;list-style-position:inside}
details.file>summary .path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;font-weight:500;overflow-wrap:anywhere}
.row{padding:10px 12px;border-top:1px solid var(--line2);display:grid;gap:6px;scroll-margin:80px}
.row:focus{outline:none}
.row.cur{background:var(--selected);box-shadow:inset 3px 0 0 var(--focus)}
.row-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ctx{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.src{font-size:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
.actions{margin-left:auto;display:flex;gap:6px}
.text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}
.s-signed .text,.s-ignored .text{color:var(--muted)}
del{background:#FDECEC;color:#B91C1C}
ins{background:#E7F6EC;color:#166534}
.chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:4px;font-size:12px;font-weight:500;white-space:nowrap}
.chip-unsigned{background:var(--grey);color:var(--muted)}
.chip-changed{background:#F5A524;color:#3B2300}
.chip-signed{background:#E7F6EC;color:#166534}
.chip-ignored{background:transparent;color:var(--muted);border:1px dashed var(--control)}
.chip-needs{background:#FFF7E6;color:#92400E}
.chip[hidden]{display:none}
.label{color:var(--muted);font-size:12px;margin-right:4px}
.subject{font-weight:600}
.plain .text{max-height:320px;overflow:auto;font-size:14px;background:var(--frame);border-radius:6px;padding:8px 12px}
details.preview>summary{cursor:pointer;color:var(--link);font-size:13px;width:max-content}
details.preview iframe{display:block;width:100%;max-width:760px;height:640px;border:1px solid var(--line);border-radius:6px;margin-top:8px;background:#fff}
.comments{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.comments:empty{display:none}
.comments li{background:#FFF7E6;border-radius:6px;padding:6px 10px;font-size:13px}
.comments li.resolved{background:var(--grey);color:var(--muted);text-decoration:line-through}
.by{color:var(--muted);font-size:12px}
.comment-form{display:grid;gap:8px;max-width:640px;padding:8px 0}
.comment-form label{display:grid;gap:4px;font-size:13px;font-weight:500}
.comment-form textarea{font:inherit;font-weight:400;border:1px solid #8796AB;border-radius:6px;padding:6px 10px;resize:vertical}
.form-actions{display:flex;gap:8px}
.empty{color:var(--muted);padding:32px 0;text-align:center}
.flash{position:fixed;right:24px;bottom:24px;max-width:420px;background:var(--ink);color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 8px 24px rgba(11,37,64,.24);font-size:14px}
.flash.bad{background:#B91C1C}
@media (max-width:860px){.layout{grid-template-columns:minmax(0,1fr);padding:0 16px}.side{position:static}.nav{flex-direction:row;flex-wrap:wrap}.sheet{padding:16px}.top{padding:16px}.actions{margin-left:0}}
`;

/** Static page script: data only comes from data-* attributes and API JSON, never interpolated into code. */
const SCRIPT = `
(() => {
  const rows = Array.from(document.querySelectorAll('.row'));
  const byKey = new Map();
  for (const r of rows) {
    const k = r.dataset.file + '\\u0000' + r.dataset.hash;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  const CHIP = { unsigned: '○ Unsigned', changed: '△ Changed', signed: '✓ Signed', ignored: '– Ignored' };
  const flash = document.getElementById('flash');
  let flashTimer;
  function say(msg, bad) {
    flash.textContent = msg;
    flash.className = bad ? 'flash bad' : 'flash';
    flash.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash.hidden = true; }, bad ? 8000 : 2500);
  }
  function applyCounts(counts) {
    if (!counts) return;
    for (const el of document.querySelectorAll('[data-c]')) {
      const [s, f] = el.dataset.c.split(':');
      const list = s === '*' ? Object.values(counts) : [counts[s]];
      let n = 0;
      for (const c of list) {
        if (!c) continue;
        n += f === 'todo' ? c.unsigned + c.changed : c[f];
      }
      el.textContent = n.toLocaleString('en-US');
    }
  }
  function setState(row, status, needsEdit) {
    row.classList.remove('s-' + row.dataset.status);
    row.classList.add('s-' + status);
    row.dataset.status = status;
    const chip = row.querySelector('[data-chip]');
    chip.className = 'chip chip-' + status;
    chip.textContent = CHIP[status];
    row.querySelector('[data-needs]').hidden = !needsEdit;
    if (!needsEdit) for (const li of row.querySelectorAll('.comments li')) li.classList.add('resolved');
    row.querySelector('[data-act="sign"]').textContent = status === 'signed' ? 'Unsign' : 'Sign';
    row.querySelector('[data-act="ignore"]').textContent = status === 'ignored' ? 'Unignore' : 'Ignore';
  }
  function applyItems(items) {
    for (const it of items || []) for (const r of byKey.get(it.file + '\\u0000' + it.hash) || []) setState(r, it.status, it.needsEdit);
  }
  async function post(path, body) {
    let res;
    try {
      res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      say('Could not reach the review server. Is pnpm copy:review still running?', true);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) { say('The copy changed since this page loaded. Reload the page and try again.', true); return null; }
    if (!res.ok) { say(data.error || 'Request failed (' + res.status + ')', true); return null; }
    applyCounts(data.counts);
    applyItems(data.items);
    refreshGroups();
    return data;
  }
  const ref = (row) => ({ file: row.dataset.file, hash: row.dataset.hash });
  async function act(row, which) {
    const st = row.dataset.status;
    const path = which === 'sign' ? (st === 'signed' ? '/api/unsign' : '/api/sign') : (st === 'ignored' ? '/api/unignore' : '/api/ignore');
    await post(path, { items: [ref(row)] });
  }
  const pickGroupRefs = ${PICK_SRC};
  function pickFor(btn) {
    const scope = btn.closest('details.file') || btn.closest('section.surface');
    return pickGroupRefs(Array.from(scope.querySelectorAll('.row')).map((r) => ({
      file: r.dataset.file, hash: r.dataset.hash, status: r.dataset.status, open: r.closest('details.file').open,
    })));
  }
  function refreshGroups() {
    for (const btn of document.querySelectorAll('button.group-sign')) {
      const n = pickFor(btn).n;
      btn.dataset.n = String(n);
      btn.textContent = 'Sign all shown (' + n.toLocaleString('en-US') + ')';
      btn.disabled = n === 0;
    }
  }
  async function group(btn) {
    const pick = pickFor(btn);
    const n = pick.n;
    if (n === 0) return;
    if (!confirm('Sign ' + n + (n === 1 ? ' item?' : ' items?'))) return;
    btn.disabled = true;
    const data = await post('/api/sign', { items: pick.refs });
    refreshGroups();
    if (data) say('Signed ' + n + (n === 1 ? ' item.' : ' items.'));
  }
  const tpl = document.getElementById('comment-tpl');
  function openComment(row) {
    let f = row.querySelector('.comment-form');
    if (!f) {
      f = tpl.content.firstElementChild.cloneNode(true);
      row.appendChild(f);
      f.querySelector('[data-cancel]').addEventListener('click', () => { f.remove(); row.focus(); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const comment = f.elements.comment.value.trim();
        const suggestion = f.elements.suggestion.value.trim();
        if (!comment) return;
        const body = Object.assign(ref(row), { comment }, suggestion ? { suggestion } : {});
        const data = await post('/api/comment', body);
        if (!data) return;
        for (const r of byKey.get(row.dataset.file + '\\u0000' + row.dataset.hash) || []) {
          const li = document.createElement('li');
          li.textContent = 'You: ' + comment;
          if (suggestion) {
            const s = document.createElement('div');
            s.className = 'suggestion';
            s.textContent = 'Suggested: ' + suggestion;
            li.appendChild(s);
          }
          r.querySelector('.comments').appendChild(li);
        }
        f.remove();
        row.focus();
        say('Comment saved.');
      });
    }
    f.elements.comment.focus();
  }
  let cur = -1;
  const visible = (r) => r.offsetParent !== null;
  function move(step) {
    let i = cur;
    do { i += step; } while (i >= 0 && i < rows.length && !visible(rows[i]));
    if (i < 0 || i >= rows.length) return;
    select(i);
  }
  function select(i) {
    if (cur >= 0) rows[cur].classList.remove('cur');
    cur = i;
    rows[cur].classList.add('cur');
    rows[cur].focus({ preventScroll: true });
    rows[cur].scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('button.group-sign');
    if (g) { e.preventDefault(); group(g); return; }
    const b = e.target.closest('button[data-act]');
    const row = e.target.closest('.row');
    if (row && !e.target.closest('.comment-form')) {
      const i = rows.indexOf(row);
      if (i !== cur) select(i);
    }
    if (!b || !row) return;
    if (b.dataset.act === 'comment') openComment(row);
    else act(row, b.dataset.act);
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details.file')) { refreshGroups(); return; }
    if (!d.matches || !d.matches('details.preview') || !d.open) return;
    const f = d.querySelector('iframe[data-src]');
    if (f && !f.getAttribute('src')) f.setAttribute('src', f.dataset.src);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const form = e.target.closest && e.target.closest('.comment-form');
    if (form) {
      if (e.key === 'Escape') { const row = form.closest('.row'); form.remove(); row.focus(); }
      return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'j') move(1);
    else if (e.key === 'k') move(-1);
    else if (e.key === 's' && cur >= 0) { if (rows[cur].dataset.status !== 'signed') act(rows[cur], 'sign'); }
    else if (e.key === 'c' && cur >= 0) openComment(rows[cur]);
    else return;
    e.preventDefault();
  });
})();
`;
