import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { FridayRow } from './friday-row';

const dock = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slot="ask-dock"]')!;

describe('FridayRow', () => {
  it('the dock opens on a full answer with its citation, never empty', () => {
    const { container } = render(<FridayRow />);
    const first = FRIDAY_ANSWERS[1]!;
    expect(within(dock(container)).getByRole('button', { name: first.question }).getAttribute('aria-pressed')).toBe('true');
    for (const p of first.answer) expect(dock(container).textContent).toContain(p.text);
    expect(within(dock(container)).getAllByRole('button', { name: /^Evidence 1: / }).length).toBeGreaterThan(0);
  });

  it('a question chip switches the answer, and a pill opens the evidence sheet', () => {
    const { container } = render(<FridayRow />);
    fireEvent.click(within(dock(container)).getByRole('button', { name: FRIDAY_ANSWERS[3]!.question }));
    expect(screen.getByTestId('friday-live').textContent).toBe(FRIDAY_ANSWERS[3]!.answer.map((p) => p.text).join(''));
  });
});
