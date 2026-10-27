import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LABEL_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

/** Validates `SHOTS_LABEL` (the screenshot folder name under `apps/web/.shots/`). Unset means `local`. */
export function shotsLabel(raw: string | undefined): string {
  if (raw === undefined) return 'local';
  if (!LABEL_PATTERN.test(raw) || raw === '.' || raw === '..') {
    throw new Error('SHOTS_LABEL must match [A-Za-z0-9_.-] and not be empty, "." or ".."');
  }
  return raw;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Pairs `<label>-<w>.png` across the label folders (before, after, ...) of `rootDir` into `rootDir/index.html`. */
export function writeIndexPage(rootDir: string): void {
  if (!existsSync(rootDir)) return;
  const folders = readdirSync(rootDir).filter((f) => statSync(join(rootDir, f)).isDirectory()).sort();
  const names = new Set<string>();
  for (const f of folders) for (const n of readdirSync(join(rootDir, f))) if (n.endsWith('.png')) names.add(n);
  const rows = [...names].sort().map((n) => {
    const cells = folders.map((f) => (existsSync(join(rootDir, f, n)) ? `<td><img src="${esc(f)}/${esc(n)}" alt="${esc(f)} ${esc(n)}" loading="lazy"></td>` : '<td class="gap">missing</td>'));
    return `<tr><th scope="row">${esc(n.replace(/\.png$/, ''))}</th>${cells.join('')}</tr>`;
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shots</title>
<style>body{font:14px Inter,sans-serif;margin:16px}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px;vertical-align:top}img{max-width:420px;height:auto}.gap{color:#a00}</style></head>
<body><table><thead><tr><th>shot</th>${folders.map((f) => `<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;
  writeFileSync(join(rootDir, 'index.html'), html);
}
