// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/(app)/kb/actions', () => ({ loadKbArticle: vi.fn() }));
import { AskAnswer, evidenceIdsOf, parseAnswer } from './answer';

const C = '11111111-1111-4111-8111-111111111111';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';

describe('AskAnswer', () => {
  it('marker → chip with evidence link', () => {
    render(<AskAnswer clientId={C} content={`Acme cut prices [ev:${E2}]. They also added ads [ev:${E1}] [ev:${E2}].`} citations={[`ev:${E1}`, `ev:${E2}`]} />);
    const chips = screen.getAllByRole('link');
    // Numbered in first-appearance order; a repeated id keeps its number.
    expect(chips.map((a) => a.getAttribute('aria-label'))).toEqual(['Evidence 1', 'Evidence 2', 'Evidence 1']);
    expect(chips[0]!.getAttribute('href')).toBe(`/c/${C}/evidence/${E2}`);
    expect(chips[1]!.getAttribute('href')).toBe(`/c/${C}/evidence/${E1}`);
    expect(chips[0]!.textContent).toBe('1');
    expect(screen.queryByText(/\[ev:/)).toBeNull();
  });

  it('renders markers that are not in citations, or not exact, as plain text', () => {
    const upper = E1.toUpperCase();
    render(<AskAnswer clientId={C} content={`One [ev:${E2}] two [EV:${E1}] three [ev:${upper}].`} citations={[`ev:${E1}`]} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(new RegExp(`\\[ev:${E2}\\]`))).toBeTruthy();
    expect(screen.getByText(/\[EV:/)).toBeTruthy();
  });

  it('possible reason styled', () => {
    render(<AskAnswer clientId={C} content={`Acme cut prices [ev:${E1}]. Possible reason: a slow season.`} citations={[`ev:${E1}`]} />);
    const label = screen.getByText('Possible reason:');
    expect(label.className).toContain('text-muted-foreground');
    expect(screen.getByText(/a slow season\./)).toBeTruthy();
  });

  it('keeps paragraphs', () => {
    const { container } = render(<AskAnswer clientId={C} content={'First paragraph.\n\nSecond paragraph.'} citations={[]} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});

describe('parseAnswer / evidenceIdsOf', () => {
  it('splits text, chips and reason labels', () => {
    expect(parseAnswer(`A [ev:${E1}]. Possible reason: b.`, [`ev:${E1}`])).toEqual([
      [{ kind: 'text', text: 'A ' }, { kind: 'chip', id: E1, n: 1 }, { kind: 'text', text: '. ' }, { kind: 'reason' }, { kind: 'text', text: ' b.' }],
    ]);
  });
  it('keeps only ev: citations, unique, at most 10', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `ev:00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`);
    expect(evidenceIdsOf([`kb:${E1}`, `ev:${E1}`, `ev:${E1}`])).toEqual([E1]);
    expect(evidenceIdsOf(ids)).toHaveLength(10);
  });
});

describe('kb citations', () => {
  const K = '33333333-3333-4333-8333-333333333333';
  it('kb marker in citations becomes an Article chip; ev behaviour unchanged', () => {
    render(<AskAnswer clientId={C} content={`See the guide [kb:${K}] and proof [ev:${E1}].`} citations={[`kb:${K}`, `ev:${E1}`]} />);
    expect(screen.getByRole('button', { name: /article/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Evidence 1' })).toBeTruthy();
    expect(screen.queryByText(/\[kb:/)).toBeNull();
  });
  it('unknown prefix or uncited kb stays text', () => {
    render(<AskAnswer clientId={C} content={`A [kb:${K}] B [xx:${K}].`} citations={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/\[xx:/)).toBeTruthy();
  });
  it('evidenceIdsOf ignores kb refs', () => {
    expect(evidenceIdsOf([`kb:${K}`, `ev:${E1}`])).toEqual([E1]);
  });
});
