// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('renders nothing without evidence', () => {
    const { container } = render(<EvidenceChips clientId={C} ids={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
