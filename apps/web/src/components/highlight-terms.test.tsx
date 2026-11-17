// @vitest-environment jsdom
import { findBannedTerms } from '@cs/core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HighlightTerms } from './highlight-terms';

afterEach(cleanup);
const marks = (text: string, terms: string[]) => {
  const { container } = render(<p><HighlightTerms text={text} terms={terms} /></p>);
  return [...container.querySelectorAll('mark')].map((m) => m.textContent);
};

describe('HighlightTerms', () => {
  it('marks whole words only, case-insensitive', () => {
    expect(marks('Cheap tune-ups, cheaper tune-ups, a cheap deal', ['cheap'])).toEqual(['Cheap', 'cheap']);
  });
  it('treats Unicode letters as word characters, like findBannedTerms', () => {
    expect(marks('café and cafés', ['café'])).toEqual(['café']);
    expect(findBannedTerms('café and cafés', ['café'])).toEqual(['café']);
  });
  it('matches multi-word terms across spaces, merges overlaps and keeps the text', () => {
    expect(marks('A free   estimate. Free estimate now', ['free estimate', 'estimate'])).toEqual(['free   estimate', 'Free estimate']);
    const { container } = render(<p><HighlightTerms text="Free tune-up, free!" terms={['free']} /></p>);
    expect(container.textContent).toBe('Free tune-up, free!');
  });
  it('renders plain text with no terms or no match', () => {
    expect(marks('Nothing here', [])).toEqual([]);
    expect(marks('Nothing here', ['cheap', ' '])).toEqual([]);
  });
});
