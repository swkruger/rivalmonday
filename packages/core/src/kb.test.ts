import { describe, expect, it } from 'vitest';
import { chunkMarkdown, KB_CHUNK_CHARS, KB_MAX_CHUNKS, lintKbText, renderKbText } from './kb';

const names = { productName: 'Acme Spy', assistantName: 'Penny' };

describe('renderKbText', () => {
  it('replaces placeholders, tolerating inner whitespace, and leaves unknown ones literal', () => {
    expect(renderKbText('{{product}} / {{ product }} / {{assistant}} / {{  assistant}}', names)).toBe('Acme Spy / Acme Spy / Penny / Penny');
    expect(renderKbText('Hi {{nope}} and {{Product}}', names)).toBe('Hi {{nope}} and {{Product}}');
  });
});

describe('lintKbText', () => {
  it('flags Rival Monday and Friday for platform articles with the decided copy', () => {
    expect(lintKbText('platform', 'Welcome to rival monday!')).toEqual(['Uses "Rival Monday": write {{product}} so white-label agencies see their own name.']);
    expect(lintKbText('platform', 'Ask Friday.')).toEqual(['Uses "Friday": write {{assistant}} so renamed assistants show their own name.']);
    expect(lintKbText('platform', 'Rival Monday and Friday')).toHaveLength(2);
  });
  it('does not flag partial words, placeholders, or non-platform levels', () => {
    expect(lintKbText('platform', 'Fridays are fine; {{product}} and {{assistant}} too')).toEqual([]);
    expect(lintKbText('agency', 'Rival Monday Friday')).toEqual([]);
    expect(lintKbText('client', 'Rival Monday Friday')).toEqual([]);
  });
});

describe('chunkMarkdown', () => {
  it('returns no chunks for an empty or heading-only doc', () => {
    expect(chunkMarkdown('')).toEqual({ chunks: [], truncated: false });
    expect(chunkMarkdown('# Only a heading\n\n')).toEqual({ chunks: [], truncated: false });
  });
  it('prefixes chunks with the heading path', () => {
    const { chunks } = chunkMarkdown('# A\n\nintro\n\n## B\n\nbody b\n\n### C\n\nbody c');
    expect(chunks).toEqual(['A\n\nintro', 'A › B\n\nbody b', 'A › B › C\n\nbody c']);
  });
  it('resets the path when a sibling heading appears', () => {
    const { chunks } = chunkMarkdown('# A\n## B\nx\n## C\ny');
    expect(chunks).toEqual(['A › B\n\nx', 'A › C\n\ny']);
  });
  it('uses no prefix before the first heading', () => {
    expect(chunkMarkdown('plain').chunks).toEqual(['plain']);
  });
  it('packs paragraphs greedily up to exactly the budget and splits just beyond', () => {
    const prefix = 'H\n\n';
    const room = KB_CHUNK_CHARS - prefix.length;
    const a = 'a'.repeat(100);
    const b = 'b'.repeat(room - 100 - 2); // a + \n\n + b fills the chunk exactly
    const fit = chunkMarkdown(`# H\n\n${a}\n\n${b}`).chunks;
    expect(fit).toHaveLength(1);
    expect(fit[0]!.length).toBe(KB_CHUNK_CHARS);
    const over = chunkMarkdown(`# H\n\n${a}\n\n${b}b`).chunks;
    expect(over).toEqual([`${prefix}${a}`, `${prefix}${b}b`]);
  });
  it('hard-splits an oversize paragraph at the last sentence end, else at the limit', () => {
    const sentence = 'This is a sentence. ';
    const para = sentence.repeat(100).trim();
    const { chunks } = chunkMarkdown(`# H\n\n${para}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(KB_CHUNK_CHARS);
      expect(c.startsWith('H\n\n')).toBe(true);
      expect(c.endsWith('sentence.')).toBe(true);
    }
    const blob = chunkMarkdown(`# H\n\n${'x'.repeat(3000)}`).chunks;
    expect(blob.map((c) => c.length)).toEqual([KB_CHUNK_CHARS, KB_CHUNK_CHARS, 3000 - 2 * (KB_CHUNK_CHARS - 3) + 3]);
  });
  it('keeps a code fence (with blank lines inside) whole when it fits and ignores # inside it', () => {
    const fence = '```\n# not a heading\n\nline two\n```';
    const { chunks } = chunkMarkdown(`# H\n\nbefore\n\n${fence}\n\nafter`);
    expect(chunks).toEqual([`H\n\nbefore\n\n${fence}\n\nafter`]);
  });
  it('caps at 200 chunks and flags truncation', () => {
    const doc = Array.from({ length: 201 }, (_, i) => `# S${i}\n\nbody ${i}`).join('\n\n');
    const r = chunkMarkdown(doc);
    expect(r.chunks).toHaveLength(KB_MAX_CHUNKS);
    expect(r.truncated).toBe(true);
    expect(chunkMarkdown(Array.from({ length: 200 }, (_, i) => `# S${i}\n\nb`).join('\n\n')).truncated).toBe(false);
  });
});

describe('renderKbText {{client}}', () => {
  it('renders the client name, or your business when absent or blank', () => {
    expect(renderKbText('Watching {{client}} / {{ client }}', { ...names, clientName: 'Acme HVAC' })).toBe('Watching Acme HVAC / Acme HVAC');
    expect(renderKbText('For {{client}}.', names)).toBe('For your business.');
    expect(renderKbText('For {{client}}.', { ...names, clientName: '  ' })).toBe('For your business.');
  });
  it('lintKbText accepts {{client}} in platform articles', () => {
    expect(lintKbText('platform', 'How {{client}} compares, via {{product}} and {{assistant}}')).toEqual([]);
  });
});
