// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { RecommendationBoard, variantFor } = await import('./recommendation-board');

const rec = (id: string, status: 'todo' | 'in_progress' | 'done' | 'dismissed', extra: object = {}) => ({
  id, title: `Rec ${id}`, rationale: 'because', effort: 'L', impact: 'H', owner: 'client', status, dismissReason: status === 'dismissed' ? 'Not now' : null, dueAt: null,
  source: 'brief', evidenceIds: ['e1'], upsellTag: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', ...extra,
});

describe('RecommendationBoard', () => {
  it('groups by status with a collapsed dismissed list', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo'), rec('b', 'in_progress'), rec('c', 'done'), rec('d', 'dismissed')]} />);
    expect(within(screen.getByRole('region', { name: 'To do' })).getByText('Rec a')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Rec b')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Rec c')).toBeTruthy();
    expect(screen.getByText(/1 dismissed/i)).toBeTruthy();
  });

  it('each item is a card that keeps role=article; dismissed summary unchanged', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo'), rec('b', 'done'), rec('d', 'dismissed')]} />);
    expect(container.querySelectorAll('[data-slot=card]')).toHaveLength(2);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(container.querySelector('details summary')!.textContent).toBe('1 dismissed');
  });

  it('names an evidence pill after its source and date when refs are given', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} refs={{ e1: { source: 'Smith HVAC', channel: 'Website', date: 'Oct 3' } }} />);
    expect(screen.getByRole('link', { name: 'Evidence 1: Smith HVAC, Oct 3' })).toBeTruthy();
  });

  it('hides status controls for read-only viewers and the upsell tag for clients', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit={false} items={[rec('a', 'todo', { upsellTag: 'ppc' })]} />);
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
    expect(screen.queryByText(/ppc/)).toBeNull();
  });

  it('offers the next steps for an editable to-do card', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec('a', 'todo', { upsellTag: 'ppc' })]} />);
    expect(screen.getByRole('button', { name: 'Start Rec a' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark Rec a done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss Rec a' })).toBeTruthy();
    expect(screen.getByText('Upsell: ppc')).toBeTruthy();
  });

  it('effort and impact read "Effort: Low" / "Impact: High"', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} />);
    expect(screen.getByText('Effort: Low')).toBeTruthy();
    expect(screen.getByText('Impact: High')).toBeTruthy();
  });

  it('client role sees "For you", agency sees "Client"', () => {
    const { unmount } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} />);
    expect(screen.getByText('For you')).toBeTruthy();
    unmount();
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec('a', 'todo')]} />);
    expect(screen.getByText('Client')).toBeTruthy();
    expect(screen.queryByText('For you')).toBeNull();
  });

  it('an empty column says "Nothing here yet."', () => {
    render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} />);
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Nothing here yet.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'To do' })).queryByText('Nothing here yet.')).toBeNull();
  });

  it('lanes carry data-lane and fixed tints', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} />);
    expect([...container.querySelectorAll('section[data-lane]')].map((e) => e.getAttribute('data-lane'))).toEqual(['todo', 'in_progress', 'done']);
    expect(container.querySelector('[data-lane=todo]')!.className).toContain('bg-muted-surface');
    expect(container.querySelector('[data-lane=in_progress]')!.className).toContain('bg-chip-info-bg');
    expect(container.querySelector('[data-lane=done]')!.className).toContain('bg-chip-success-bg');
  });

  it('cards are raised and buttons use ink / done / outline', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec('a', 'todo'), rec('b', 'in_progress'), rec('c', 'done')]} />);
    expect(container.querySelector('[data-slot=card]')!.getAttribute('data-variant')).toBe('raised');
    expect(screen.getByRole('button', { name: 'Start Rec a' }).getAttribute('data-variant')).toBe('ink');
    const done = screen.getByRole('button', { name: 'Mark Rec b done' });
    expect(done.getAttribute('data-variant')).toBe('done');
    expect(done.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen Rec c' }).getAttribute('data-variant')).toBe('outline');
    expect(screen.getByRole('button', { name: 'Mark Rec a done' }).getAttribute('data-variant')).toBe('outline');
  });

  it('impact and owner chips are toned', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo', { owner: 'agency' })]} />);
    expect(container.querySelector('[data-slot="tag"][data-tone="danger"]')!.textContent).toBe('Impact: High');
    expect(container.querySelector('[data-slot="tag"][data-tone="info"]')!.textContent).toBe('Agency');
  });

  it('evidence pills are info-toned', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'todo')]} />);
    expect(container.querySelector('[data-slot="citation-pill"]')!.className).toContain('bg-chip-info-bg');
  });

  it('variantFor: forward moves are filled, the rest outline', () => {
    expect(variantFor('todo', 'in_progress')).toBe('ink');
    expect(variantFor('in_progress', 'done')).toBe('done');
    expect(variantFor('todo', 'done')).toBe('outline');
    expect(variantFor('in_progress', 'todo')).toBe('outline');
    expect(variantFor('done', 'in_progress')).toBe('outline');
  });

  it('chips are strong and done cards carry a check beside the title', () => {
    const { container } = render(<RecommendationBoard action={vi.fn()} clientId="c1" agency={false} canEdit items={[rec('a', 'done')]} />);
    expect(container.querySelector('[data-slot="tag"]')!.className).toContain('font-semibold');
    expect(container.querySelector('[data-slot=card] p svg.text-success')).toBeTruthy();
  });
});
