import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEFORE_AFTER, CAST, CEILING_LINES, OPPORTUNITY, opportunityLine, RIVAL_STORY, rivalStoryMoves, SECTIONS } from '../../../content/home';
import { AgencyCeiling } from './agency-ceiling';
import { BeforeAfter } from './before-after';
import { Cast } from './cast';
import { Opportunity } from './opportunity';
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

describe('AgencyCeiling', () => {
  it('renders the H2, three lines and the closing line after the list', () => {
    const { container } = render(<AgencyCeiling />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.ceiling.heading);
    expect(container.querySelector('section#ceiling')).toBeTruthy();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(CEILING_LINES.length);
    expect(items[0]!.textContent).toContain(CEILING_LINES[0]!.lead);
    const closing = screen.getByText(SECTIONS.ceiling.body);
    expect(closing.compareDocumentPosition(screen.getByRole('list')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe('Opportunity', () => {
  it('renders the H2, three outcomes and the economics strip with the example figures', () => {
    const { container } = render(<Opportunity />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.opportunity.heading);
    expect(container.querySelector('section#opportunity')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(OPPORTUNITY.outcomes.length);
    expect(screen.getByText(opportunityLine())).toBeTruthy();
    expect(screen.getByText(/\$2,068/)).toBeTruthy();
    expect(screen.getByText(OPPORTUNITY.exampleNote)).toBeTruthy();
    expect(screen.getByRole('link', { name: OPPORTUNITY.link.label }).getAttribute('href')).toBe('/partners');
  });
});

describe('Cast', () => {
  it('renders the H2 and three named columns, with the avatar only in Friday', () => {
    const { container } = render(<Cast />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SECTIONS.cast.heading);
    expect(container.querySelector('section#cast')).toBeTruthy();
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(CAST.map((c) => c.name));
    for (const c of CAST) expect(screen.getByText(c.body)).toBeTruthy();
    const cols = Array.from(container.querySelectorAll('[data-cast]'));
    expect(cols).toHaveLength(3);
    const withAvatar = cols.filter((c) => c.querySelector('[data-slot="friday-avatar"], svg, img'));
    expect(withAvatar.map((c) => c.getAttribute('data-cast'))).toEqual(['Friday']);
  });
});

describe('BeforeAfter', () => {
  it('renders an accessible table with 2 row and 2 column headers', () => {
    const { container } = render(<BeforeAfter />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toBe(SECTIONS['before-after'].heading);
    expect(container.querySelector('section#before-after')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(screen.getAllByRole('rowheader').map((r) => r.textContent)).toEqual(BEFORE_AFTER.rows.map((r) => r.who));
    expect(screen.getAllByRole('columnheader').map((r) => r.textContent)).toEqual([...BEFORE_AFTER.columns]);
    expect(screen.getByText(BEFORE_AFTER.rows[0]!.after).className).toContain('font-medium');
    expect(screen.getByText(BEFORE_AFTER.rows[0]!.before).className).toContain('text-ink-secondary');
  });
});
