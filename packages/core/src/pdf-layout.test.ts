import { describe, expect, it } from 'vitest';
import { isCurrentPdfKey, PDF_KEY_SUFFIX, PDF_LAYOUT_VERSION } from './pdf-layout';

describe('pdf layout version', () => {
  it('counts only a key with the current layout version as current', () => {
    expect(PDF_KEY_SUFFIX).toBe(`.v${PDF_LAYOUT_VERSION}.pdf`);
    expect(isCurrentPdfKey(`briefs/a/b${PDF_KEY_SUFFIX}`)).toBe(true);
    expect(isCurrentPdfKey('briefs/a/b.pdf')).toBe(false);
    expect(isCurrentPdfKey(`briefs/a/b.v${PDF_LAYOUT_VERSION - 1}.pdf`)).toBe(false);
  });
});
