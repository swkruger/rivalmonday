// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => <a data-next-link="1" {...p} /> }));
import { EvidenceChips } from './evidence-chips';

const C = '11111111-1111-4111-8111-111111111111';
const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);

describe('EvidenceChips', () => {
  it('links each chip to the evidence page and caps the list', () => {
    render(<EvidenceChips clientId={C} ids={ids} />);
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe(`/c/${C}/evidence/${ids[0]}`);
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('+2 more')).toBeTruthy();
  });
  it('names the source when refs are given and falls back otherwise', () => {
    const refs = { [ids[0]!]: { source: 'Smith HVAC', channel: 'Website', date: 'Oct 20, 2026' } };
    const { container } = render(<EvidenceChips clientId={C} ids={ids.slice(0, 2)} refs={refs} />);
    expect(screen.getByRole('link', { name: 'Evidence 1: Smith HVAC, Oct 20, 2026' }).getAttribute('href')).toBe(`/c/${C}/evidence/${ids[0]}`);
    expect(screen.getByRole('link', { name: 'Evidence 2' })).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="citation-pill"]')).toHaveLength(2);
    expect(container.querySelectorAll('a[data-next-link="1"][data-slot="citation-pill"]')).toHaveLength(2);
  });
  it('evidenceHref replaces the app evidence link', () => {
    const ref = { source: 'Smith HVAC', channel: 'Website', date: 'Oct 20, 2026', servable: true };
    render(<EvidenceChips clientId={C} ids={ids.slice(0, 2)} refs={{ [ids[0]!]: ref, [ids[1]!]: ref }} evidenceHref={(id) => `/sample/T/evidence/${id}`} />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([`/sample/T/evidence/${ids[0]}`, `/sample/T/evidence/${ids[1]}`]);
  });
  it('unservable evidence renders without a link', () => {
    const refs = {
      [ids[0]!]: { source: 'Smith HVAC', channel: 'Website', date: 'Oct 20, 2026', servable: true },
      [ids[1]!]: { source: 'Smith HVAC', channel: 'Google Business Profile', date: 'Oct 21, 2026', servable: false },
    };
    const { container } = render(<EvidenceChips clientId={C} ids={ids.slice(0, 3)} refs={refs} evidenceHref={(id) => `/sample/T/evidence/${id}`} />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([`/sample/T/evidence/${ids[0]}`]);
    const plain = container.querySelectorAll('span[data-slot="citation-pill"]');
    expect([...plain].map((p) => p.getAttribute('aria-label'))).toEqual(['Evidence 2: Smith HVAC, Oct 21, 2026', 'Evidence 3']);
    expect(container.querySelectorAll('[data-slot="citation-pill"]')).toHaveLength(3);
  });
  it('renders nothing without evidence', () => {
    const { container } = render(<EvidenceChips clientId={C} ids={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
