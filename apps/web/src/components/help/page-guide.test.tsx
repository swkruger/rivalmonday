// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_PAGE_GUIDE_EVENT } from '@/help/copy';
import { ReadOnlyProvider } from '@/components/read-only';
import { HelpProvider } from './help-provider';

const m = vi.hoisted(() => ({ path: '/agency' }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => m.path }));
const { PageGuide, guideSlug, helpScopeOf } = await import('./page-guide');

const C = '00000000-0000-4000-8000-0000000000c1';
const GUIDE = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Overview guide',
  sections: [
    { heading: 'What this page tells you', markdown: 'Your **headline** numbers.' },
    { heading: 'How to use it', markdown: 'Start at the top.' },
    { heading: 'Common questions', markdown: 'Why is it empty?' },
  ],
};
const ok = (canAsk = true, guide: typeof GUIDE | null = GUIDE) => vi.fn(async () => ({ guide, canAsk }));

function ui(load: ReturnType<typeof ok>, opts: { readOnly?: boolean } = {}) {
  return (
    <ReadOnlyProvider readOnly={opts.readOnly ?? false}>
      <HelpProvider value={{ audience: 'agency', names: { agency: 'Acme', assistant: 'Friday' } }}>
        <PageGuide helpKey="page:overview" pageTitle="Overview" load={load} />
      </HelpProvider>
    </ReadOnlyProvider>
  );
}
const openIt = () => fireEvent.click(screen.getByRole('button', { name: /guide/i }));
const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

beforeEach(() => {
  m.path = `/c/${C}`;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('helpScopeOf / guideSlug', () => {
  it('derives the help context from the path', () => {
    expect(helpScopeOf('/platform/agencies')).toEqual({ context: 'platform' });
    expect(helpScopeOf('/agency/settings/team')).toEqual({ context: 'agency' });
    expect(helpScopeOf(`/c/${C}/competitors`)).toEqual({ context: 'client', clientId: C });
    expect(helpScopeOf('/c/not-a-uuid')).toEqual({ context: 'agency' });
  });
  it('slugs section headings', () => {
    expect(guideSlug('How to use it')).toBe('how-to-use-it');
    expect(guideSlug('Common questions')).toBe('common-questions');
  });
});

describe('PageGuide', () => {
  it('loads lazily on first open only, with the path-derived context, and shows the three sections', async () => {
    const load = ok();
    render(ui(load));
    expect(load).not.toHaveBeenCalled();
    openIt();
    await waitFor(() => expect(screen.getByText('Common questions')).toBeTruthy());
    expect(load).toHaveBeenCalledWith('page:overview', 'client', C);
    expect(screen.getByText('headline').tagName).toBe('STRONG');
    escape();
    await waitFor(() => expect(screen.queryByText('Common questions')).toBeNull());
    openIt();
    await waitFor(() => expect(screen.getByText('Common questions')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton while loading and an error note on failure, retrying on the next open', async () => {
    let fail = true;
    const load = vi.fn(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve({ guide: GUIDE, canAsk: false })));
    render(ui(load as never));
    openIt();
    expect(screen.getByRole('status', { name: 'Loading the guide' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/could not load this guide/i)).toBeTruthy());
    escape();
    await waitFor(() => expect(screen.queryByText(/could not load/i)).toBeNull());
    fail = false;
    openIt();
    await waitFor(() => expect(screen.getByText('How to use it')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('opens from the open-page-guide event and scrolls to the anchor section once loaded', async () => {
    render(ui(ok()));
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_PAGE_GUIDE_EVENT, { detail: { anchor: 'how-to-use-it' } })); });
    await waitFor(() => expect(screen.getByText('How to use it')).toBeTruthy());
    const el = document.getElementById('how-to-use-it')!;
    expect(el.textContent).toBe('How to use it');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts[0]).toBe(el);
  });

  it('an event without an anchor opens the sheet and does not scroll', async () => {
    render(ui(ok()));
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_PAGE_GUIDE_EVENT, { detail: {} })); });
    await waitFor(() => expect(screen.getByText('How to use it')).toBeTruthy());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('shows Ask {assistant} about this page only with ask permission in a client context', async () => {
    render(ui(ok(true)));
    openIt();
    const ask = await screen.findByRole('link', { name: 'Ask Friday about this page' });
    expect(ask.getAttribute('href')).toBe(`/c/${C}/ask?q=${encodeURIComponent('Explain the Overview page')}`);
    expect(screen.getByRole('link', { name: 'Open full article' }).getAttribute('href')).toBe(`/kb/${GUIDE.id}`);
  });

  it('hides the Ask link without ask permission, outside a client context, and in a read-only session', async () => {
    const cases: [string, boolean, boolean][] = [[`/c/${C}`, false, false], ['/agency', true, false], [`/c/${C}`, true, true]];
    for (const [path, canAsk, readOnly] of cases) {
      m.path = path;
      render(ui(ok(canAsk), { readOnly }));
      openIt();
      await screen.findByRole('link', { name: 'Open full article' });
      expect(screen.queryByRole('link', { name: /^Ask / })).toBeNull();
      cleanup();
    }
  });

  it('omits the full-article link in the platform context (R6)', async () => {
    m.path = '/platform/knowledge';
    const load = ok(false);
    render(ui(load));
    openIt();
    await screen.findByText('How to use it');
    expect(load).toHaveBeenCalledWith('page:overview', 'platform', undefined);
    expect(screen.queryByRole('link', { name: 'Open full article' })).toBeNull();
  });

  it('says the guide is unavailable when the tool returned none', async () => {
    render(ui(ok(true, null)));
    openIt();
    await screen.findByText('This guide is not available.');
  });
});
