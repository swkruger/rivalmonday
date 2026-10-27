// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/(app)/kb/actions', () => ({ loadKbArticle: vi.fn() }));
import { answerMarkdown, answerSources, AskAnswer, evidenceIdsOf, plainAnswer } from './answer';

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
    expect(chips[0]!.textContent).toBe('Evidence 1');
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
    expect(label.getAttribute('data-slot')).toBe('possible-reason');
    expect(screen.getByText(/a slow season\./)).toBeTruthy();
  });

  it('keeps paragraphs', () => {
    const { container } = render(<AskAnswer clientId={C} content={'First paragraph.\n\nSecond paragraph.'} citations={[]} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});

describe('citation pills and sources', () => {
  const refs = { [E1]: { source: 'Smith HVAC', channel: 'Pricing page', date: 'Oct 20, 2026' } };
  it('an ev cite with a ref is a pill named with source and date; without a ref it keeps "Evidence n"', () => {
    render(<AskAnswer clientId={C} content={`A [ev:${E1}] B [ev:${E2}].`} citations={[`ev:${E1}`, `ev:${E2}`]} refs={refs} />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Evidence 1: Smith HVAC, Oct 20, 2026', 'Evidence 2']);
    expect(links[0]!.getAttribute('data-slot')).toBe('citation-pill');
    expect(links[0]!.getAttribute('href')).toBe(`/c/${C}/evidence/${E1}`);
  });
  it('the Data chip keeps its name and shares the pill look', () => {
    const P = '44444444-4444-4444-8444-444444444444';
    render(<AskAnswer clientId={C} content={`x [app:${P}]`} citations={[`app:${P}@/c/${C}/competitors/${P}`]} />);
    expect(screen.getByRole('link', { name: 'Open in the app' }).getAttribute('data-slot')).toBe('citation-pill');
  });
  it('page and panel sizes are marked', () => {
    const { container, rerender } = render(<AskAnswer clientId={C} content="Hi" citations={[]} />);
    expect((container.firstChild as HTMLElement).getAttribute('data-size')).toBe('page');
    rerender(<AskAnswer clientId={C} content="Hi" citations={[]} size="panel" />);
    expect((container.firstChild as HTMLElement).getAttribute('data-size')).toBe('panel');
  });
  it('answerSources lists resolved ev cites once each in first-appearance order', () => {
    const refs2 = { ...refs, [E2]: { source: 'Jones Air', channel: 'Reviews', date: 'Oct 21, 2026' } };
    const { cites } = answerMarkdown(`[ev:${E2}] [ev:${E1}] [ev:${E2}] [ev:33333333-3333-4333-8333-333333333333]`, [`ev:${E1}`, `ev:${E2}`, 'ev:33333333-3333-4333-8333-333333333333']);
    expect(answerSources(cites, refs2, C)).toEqual([
      { href: `/c/${C}/evidence/${E2}`, title: 'Jones Air · Reviews', date: 'Oct 21, 2026' },
      { href: `/c/${C}/evidence/${E1}`, title: 'Smith HVAC · Pricing page', date: 'Oct 20, 2026' },
    ]);
    expect(answerSources(cites, {}, C)).toEqual([]);
  });
});

describe('answerMarkdown / evidenceIdsOf', () => {
  it('turns markers and reason labels into cite links', () => {
    expect(answerMarkdown(`A [ev:${E1}]. Possible reason: b.`, [`ev:${E1}`])).toEqual({
      markdown: 'A [1](#cite-0). [reason](#cite-1) b.',
      cites: [{ kind: 'ev', id: E1, n: 1 }, { kind: 'reason' }],
    });
  });
  it('plainAnswer drops markers and bold', () => {
    expect(plainAnswer(`**Acme** cut prices [ev:${E1}] [app:${E2}].`)).toBe('Acme cut prices.');
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

describe('markdown and app citations', () => {
  const P = '44444444-4444-4444-8444-444444444444';
  it('renders bold and bullet lists', () => {
    const { container } = render(<AskAnswer clientId={C} content={`**Aire Serv** is busiest.

- New ad [ev:${E1}]
- 4 jobs`} citations={[`ev:${E1}`]} />);
    expect(container.querySelector('strong')!.textContent).toBe('Aire Serv');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Evidence 1' })).toBeTruthy();
  });
  it('an app citation becomes a Data chip linking to its page; without a stored page it stays text', () => {
    const { container } = render(<AskAnswer clientId={C} content={`85 Google ads [app:${P}]. Other [app:${E2}].`} citations={[`app:${P}@/c/${C}/competitors/${P}`, `app:${E2}@//evil.example`]} />);
    const chip = screen.getByRole('link', { name: 'Open in the app' });
    expect(chip.getAttribute('href')).toBe(`/c/${C}/competitors/${P}`);
    expect(chip.textContent).toBe('Data');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container.textContent).toContain(`[app:${E2}]`);
  });
  it('links and images the model wrote are not rendered as links or images', () => {
    const { container } = render(<AskAnswer clientId={C} content={'See [this](https://evil.example) ![x](https://evil.example/t.png) and <b>raw</b>.'} citations={[]} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('this');
  });
});
