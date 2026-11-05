// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StarterChips } from './starter-chips';

afterEach(cleanup);

describe('StarterChips', () => {
  it('chips variant with hrefFor renders links styled as chips', () => {
    render(<StarterChips variant="chips" questions={['Why?']} hrefFor={(q) => `/ask?q=${q}`} />);
    const a = screen.getByRole('link', { name: 'Why?' });
    expect(a.getAttribute('href')).toBe('/ask?q=Why?');
    expect(a.className).toContain('border-line-control');
  });
  it('rows variant keeps the arrow rows', () => {
    render(<StarterChips questions={['Why?']} hrefFor={() => '/x'} />);
    expect(screen.getByRole('link').className).not.toContain('border-line-control');
  });
});
