import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RIVAL_STORY, rivalStoryMoves, SECTIONS } from '../../../content/home';
import { RivalStory } from './rival-story';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RivalStory', () => {
  it('renders the H2, the grid slider and the website-free body', () => {
    const { container } = render(<RivalStory />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toBe(SECTIONS['rival-story'].heading);
    expect(container.querySelector('section#rival-story')!.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(screen.getByRole('slider', { name: 'Week' })).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.bodyNoWeb)).toBeTruthy();
    expect(screen.getByText(RIVAL_STORY.closing)).toBeTruthy();
  });

  it('lists 2 dated moves while website monitoring is off', () => {
    render(<RivalStory />);
    const items = within(screen.getByRole('list', { name: RIVAL_STORY.logHeading })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items).toHaveLength(rivalStoryMoves(false).length);
    const t = items[0]!.querySelector('time')!;
    expect(t.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('opens the evidence dialog from a move and Escape returns focus', async () => {
    render(<RivalStory />);
    const move = within(screen.getByRole('list', { name: RIVAL_STORY.logHeading })).getAllByRole('button')[0]!;
    move.focus();
    fireEvent.click(move);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(move));
  });
});
