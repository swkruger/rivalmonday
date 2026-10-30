import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROADMAP } from '../../../content/roadmap';
import { ActionLoop } from './action-loop';

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe('roadmap', () => {
  it('the diagram has its accessible name and every step once', () => {
    render(<ActionLoop />);
    const svg = screen.getByRole('img', { name: ROADMAP.loop.label });
    for (const s of ROADMAP.loop.steps) expect(within(svg).getByText(s.name)).toBeTruthy();
  });

  it('the list repeats the seven steps in order with their detail', () => {
    render(<ActionLoop />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(ROADMAP.loop.steps.map((s, i) => `${i + 1}.${s.name}. ${s.body}`));
  });

  it('says it is planned and may change', () => {
    expect(ROADMAP.status).toMatch(/^Planned/);
    expect(ROADMAP.notice).toMatch(/not yet available/i);
    expect(ROADMAP.notice).toMatch(/may change/i);
  });

  it('no banned claims, vendor names or promised dates', () => {
    for (const s of strings(ROADMAP)) {
      expect(s, s).not.toMatch(/nobody else|only platform|#1|best-in-class|guarantee|available now/i);
      expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/);
      // the only digits are the version number
      expect(s.split('2.0').join(''), s).not.toMatch(/\d/);
    }
  });
});
