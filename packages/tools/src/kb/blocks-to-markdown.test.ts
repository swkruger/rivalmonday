import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from './blocks-to-markdown';

describe('blocksToMarkdown', () => {
  it('maps headings to hashes, list items to bullets, others to paragraphs', () => {
    const md = blocksToMarkdown([
      { path: 'body>main>h1', text: 'Title' },
      { path: 'body>main>p', text: 'Intro  text.' },
      { path: 'body>main>h3#x.promo', text: 'Sub' },
      { path: 'body>main>ul>li', text: 'one' },
      { path: 'body>main>ul>li', text: 'two' },
      { path: 'body>main>div.note', text: 'Tail' },
    ]);
    expect(md).toBe('# Title\n\nIntro text.\n\n### Sub\n\n- one\n- two\n\nTail');
  });

  it('returns an empty string for no usable blocks', () => {
    expect(blocksToMarkdown([])).toBe('');
    expect(blocksToMarkdown([{ path: 'body>p', text: '   ' }])).toBe('');
  });
});
