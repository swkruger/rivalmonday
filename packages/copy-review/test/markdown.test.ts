import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanMarkdownFile } from '../src/scan/markdown.js';

const src = readFileSync(new URL('./fixtures/guide.md', import.meta.url), 'utf8');

describe('scanMarkdownFile', () => {
  it('markdown strips front-matter and uses title', () => {
    const i = scanMarkdownFile('docs/help/pages/a.md', src, 'guides');
    expect(i.text.startsWith('# Heading in body')).toBe(true);
    expect(i.text).not.toContain('audience');
    expect(i.context).toBe('Reading your score');
    expect(i.anchor).toBe('docs/help/pages/a.md#doc#0');
    expect(i.kind).toBe('markdown');
    expect(i.line).toBe(1);
    expect(i.surface).toBe('guides');
  });
  it('falls back to first heading then file name', () => {
    expect(scanMarkdownFile('x/a.md', '# Hi there\n\nBody.', 'guides').context).toBe('Hi there');
    expect(scanMarkdownFile('x/a.md', 'Just body.', 'guides').context).toBe('a.md');
  });
});
