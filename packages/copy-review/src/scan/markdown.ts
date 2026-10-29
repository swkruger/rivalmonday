import { hashText } from '../text.js';
import type { CopyItem, Surface } from '../types.js';

/** Whole file = one item; front-matter stripped; context = front-matter `title` ?? first `# ` heading ?? file name. */
export function scanMarkdownFile(file: string, source: string, surface: Surface): CopyItem {
  const src = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  let body = src;
  let title: string | undefined;
  const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (fm) {
    body = src.slice(fm[0].length);
    const m = /^title:[ \t]*(.+?)[ \t]*$/m.exec(fm[1]!);
    if (m) title = m[1]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  body = body.trim();
  const heading = /^# +(.+?)\s*#*\s*$/m.exec(body)?.[1];
  const text = body;
  return {
    surface,
    file,
    line: 1,
    anchor: `${file}#doc#0`,
    context: title || heading || file.split('/').pop()!,
    text,
    hash: hashText(text),
    kind: 'markdown',
  };
}
