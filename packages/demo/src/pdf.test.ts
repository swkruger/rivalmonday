import { describe, expect, it } from 'vitest';
import { demoPdf } from './pdf';

describe('demoPdf', () => {
  it('builds a PDF whose xref offsets point at each object', () => {
    const bytes = demoPdf('Demo brief', ['Line one', 'Line (two) \\ three']);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain('(Line \\(two\\) \\\\ three)');
  });
});
