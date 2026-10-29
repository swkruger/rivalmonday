import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanMarkdownFile } from './scan/markdown.js';
import { scanTsFile } from './scan/ts-scan.js';
import { ruleFor, SOURCES } from './sources.js';
import { hashText } from './text.js';
import type { CopyItem } from './types.js';

/** JSON content is scanned as a TS module: `const json = <file>` keeps line numbers (prefix on line 1). */
const JSON_PREFIX = 'const json = ';

/** Every repo-relative file (forward slashes) some source rule includes, sorted. */
export function listSourceFiles(root: string): string[] {
  const files = new Set<string>();
  for (const rule of SOURCES) {
    for (const f of globSync(rule.include as string[], { cwd: root })) files.add(f.replace(/\\/g, '/'));
  }
  return [...files].sort();
}

/** Scan every source file in the repo at `root` (first matching rule per file); sorted by surface, file, line. */
export function collectScanned(root: string): CopyItem[] {
  const items: CopyItem[] = [];
  for (const file of listSourceFiles(root)) {
    const rule = ruleFor(file);
    if (!rule) continue;
    const source = readFileSync(join(root, file), 'utf8');
    if (rule.mode === 'markdown') items.push(scanMarkdownFile(file, source, rule.surface));
    else items.push(...scanTsFile(file, file.endsWith('.json') ? JSON_PREFIX + source : source, rule));
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return items.sort((a, b) => cmp(a.surface, b.surface) || cmp(a.file, b.file) || a.line - b.line);
}

/** Plain text of an HTML document: scripts/styles/tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|section)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
      if (g[0] === '#') {
        const cp = g[1]!.toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return named[g.toLowerCase()] ?? m;
    })
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Email and document preview items (rendered through @cs/email). Loaded lazily: it pulls React. */
export async function collectPreviewItems(): Promise<CopyItem[]> {
  const { renderEmail } = await import('@cs/email');
  const { EMAIL_PREVIEWS, DOCUMENT_PREVIEWS } = await import('@cs/email/previews');
  const items: CopyItem[] = [];
  for (const p of EMAIL_PREVIEWS) {
    const r = await renderEmail(p.payload);
    const text = `Subject: ${r.subject}\n\n${r.text}`;
    items.push({
      surface: 'emails', file: `packages/email/previews/${p.id}`, line: 1, anchor: `email:${p.id}`,
      context: p.label, text, hash: hashText(text), kind: 'email', html: r.html,
    });
  }
  for (const p of DOCUMENT_PREVIEWS) {
    const html = await p.render();
    const text = htmlToText(html);
    items.push({
      surface: 'documents', file: `packages/email/previews/${p.id}`, line: 1, anchor: `document:${p.id}`,
      context: p.label, text, hash: hashText(text), kind: 'document', html,
    });
  }
  return items;
}

export async function collectItems(root: string): Promise<CopyItem[]> {
  return [...collectScanned(root), ...(await collectPreviewItems())];
}
