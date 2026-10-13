/** Structural twin of `@cs/engine`'s `Block` (only the fields this needs), so callers can pass `extractBlocks` output directly. */
export interface MarkdownBlock {
  path: string;
  text: string;
}

/** The last path segment is `tag#id.class…`; the tag decides the markdown form. */
function tagOf(path: string): string {
  const last = path.split('>').pop() ?? '';
  return /^[a-z0-9]+/i.exec(last)?.[0].toLowerCase() ?? '';
}

/** Converts extracted page blocks to markdown: h1–h6 → `#`s, li → `- `, everything else → a paragraph. */
export function blocksToMarkdown(blocks: MarkdownBlock[]): string {
  const out: string[] = [];
  let prevList = false;
  for (const b of blocks) {
    const text = b.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const tag = tagOf(b.path);
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      out.push(`${'#'.repeat(Number(heading[1]))} ${text}`);
      prevList = false;
    } else if (tag === 'li') {
      // Consecutive items form one tight list; a list after other content starts its own paragraph.
      if (prevList) out[out.length - 1] += `\n- ${text}`;
      else out.push(`- ${text}`);
      prevList = true;
    } else {
      out.push(text);
      prevList = false;
    }
  }
  return out.join('\n\n');
}
