// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/c/x', router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => nav.router }));
const { FridayDock, useFridayDock } = await import('./friday-dock');
const { FridayDockTrigger } = await import('./friday-dock-trigger');

const C = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const M1 = '44444444-4444-4444-8444-444444444441';
const M2 = '44444444-4444-4444-8444-444444444442';
const config = {
  clientId: C, assistantName: 'Friday', productName: null, reviewAllowed: false, starters: ['What changed this week?'], scopeLabel: 'Acme HVAC',
  saveAction: vi.fn(), refsAction: vi.fn(async () => ({})),
};
const frame = (o: Record<string, unknown>) => `data: ${JSON.stringify({ type: 'final', citations: [], action: null, status: 'ok', ...o })}\n\n`;
const turn = (body: string) => new Response(body, { status: 200, headers: { 'x-ask-thread-id': T } });

/** jsdom has no matchMedia: every query answers `wide`. */
function viewport(wide: boolean) {
  window.matchMedia = ((q: string) => ({ matches: wide, media: q, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
function Probe() {
  const d = useFridayDock();
  return <p data-testid="probe">{d === null ? 'none' : `${d.available}|${d.open}`}</p>;
}
const page = (label = 'Overview page') => (
  <>
    <FridayDockTrigger />
    <p>{label}</p>
    <Probe />
  </>
);
const send = async (q: string) => {
  fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: q } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  });
};

beforeEach(() => {
  nav.pathname = `/c/${C}`;
  nav.router.replace.mockReset();
  nav.router.refresh.mockReset();
  nav.router.push.mockReset();
  viewport(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FridayDock (16d D-14)', () => {
  it('config=null renders only the children and useFridayDock() is null', () => {
    const { container } = render(<FridayDock config={null}>{page()}</FridayDock>);
    expect(screen.getByTestId('probe').textContent).toBe('none');
    expect(screen.queryByRole('button', { name: 'Ask Friday' })).toBeNull();
    expect(container.querySelector('[data-slot="friday-dock"]')).toBeNull();
  });

  it('≥ 1280: the trigger opens a docked column named "Ask Friday" and hides while it is open', () => {
    render(<FridayDock config={config}>{page()}</FridayDock>);
    const trigger = screen.getByRole('button', { name: 'Ask Friday' });
    expect(trigger.getAttribute('data-slot')).toBe('friday-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    const panel = screen.getByRole('complementary', { name: 'Ask Friday' });
    expect(panel.getAttribute('data-slot')).toBe('friday-panel');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByRole('heading', { level: 2, name: 'Ask Friday' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask Friday' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('probe').textContent).toBe('true|true');
  });

  it('< 1280: the trigger opens a right sheet (dialog) named "Ask Friday"', () => {
    viewport(false);
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    const dialog = screen.getByRole('dialog', { name: 'Ask Friday' });
    expect(dialog.getAttribute('data-slot')).toBe('sheet-content');
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
  });

  it('keeps the open panel and its conversation when the page (children) changes, as on navigation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => turn(frame({ messageId: M1, content: 'Acme cut prices.' }))));
    const { rerender } = render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    await send('What changed?');
    expect(screen.getByText('Acme cut prices.')).toBeTruthy();
    nav.pathname = `/c/${C}/competitors`;
    rerender(<FridayDock config={config}>{page('Competitors page')}</FridayDock>);
    expect(screen.getByText('Competitors page')).toBeTruthy();
    const panel = screen.getByRole('complementary', { name: 'Ask Friday' });
    expect(within(panel).getByText('What changed?')).toBeTruthy();
    expect(within(panel).getByText('Acme cut prices.')).toBeTruthy();
  });

  it('keeps the conversation when the panel is closed and opened again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => turn(frame({ messageId: M1, content: 'Acme cut prices.' }))));
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    await send('What changed?');
    fireEvent.click(screen.getByRole('button', { name: 'Close Friday' }));
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    expect(within(screen.getByRole('complementary', { name: 'Ask Friday' })).getByText('Acme cut prices.')).toBeTruthy();
  });

  it('on /c/<id>/ask the trigger renders nothing and an open panel closes', () => {
    const { rerender } = render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    expect(screen.getByRole('complementary', { name: 'Ask Friday' })).toBeTruthy();
    nav.pathname = `/c/${C}/ask/${T}`;
    rerender(<FridayDock config={config}>{page('Ask page')}</FridayDock>);
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask Friday' })).toBeNull();
    expect(screen.getByTestId('probe').textContent).toBe('false|false');
    nav.pathname = `/c/${C}/competitors`;
    rerender(<FridayDock config={config}>{page('Competitors page')}</FridayDock>);
    // It stays closed after leaving Ask.
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask Friday' })).toBeTruthy();
  });

  it('Close and Esc close the column', () => {
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Ask Friday' })).getByRole('button', { name: 'Close Friday' }));
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    fireEvent.keyDown(screen.getByLabelText('Ask Friday a question'), { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Ask Friday' })).toBeNull();
    expect(screen.getByTestId('probe').textContent).toBe('true|false');
  });

  it('Close and Esc close the sheet', () => {
    viewport(false);
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ask Friday' })).getByRole('button', { name: 'Close Friday' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Ask Friday' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('FridayDock panel chat (P7)', () => {
  it('two sends post the same thread id (from x-ask-thread-id) and never touch the router', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => turn(frame({ messageId: M1, content: 'First answer.' })))
      .mockImplementationOnce(async () => turn(frame({ messageId: M2, content: 'Second answer.' })));
    vi.stubGlobal('fetch', fetchMock);
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    const panel = screen.getByRole('complementary', { name: 'Ask Friday' });
    expect(within(panel).queryByRole('link', { name: 'Open full conversation' })).toBeNull();
    await send('First?');
    await send('Second?');
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { threadId?: string; question: string });
    expect(bodies[0]).toEqual({ clientId: C, question: 'First?' });
    expect(bodies[1]).toEqual({ clientId: C, threadId: T, question: 'Second?' });
    for (const t of ['First?', 'First answer.', 'Second?', 'Second answer.']) expect(within(panel).getByText(t)).toBeTruthy();
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
    expect(within(panel).getByRole('link', { name: 'Open full conversation' }).getAttribute('href')).toBe(`/c/${C}/ask/${T}`);
  });

  it('a network failure shows the error copy and the next send works', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); })
      .mockImplementationOnce(async () => turn(frame({ messageId: M1, content: 'Back again.' })));
    vi.stubGlobal('fetch', fetchMock);
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    await send('First?');
    expect(screen.getByText("Friday couldn't answer just now — please try again.")).toBeTruthy();
    await send('Again?');
    expect(screen.getByText('Back again.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('a proposed write renders the link to the full conversation, not Confirm', async () => {
    const action = { tool: 'rate_event', summary: 'Rate this change as useful', state: 'proposed' };
    vi.stubGlobal('fetch', vi.fn(async () => turn(frame({ messageId: M1, content: 'Rate this change as useful', action }))));
    render(<FridayDock config={config}>{page()}</FridayDock>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Friday' }));
    await send('Rate the latest change as useful');
    const panel = screen.getByRole('complementary', { name: 'Ask Friday' });
    expect(within(panel).queryByRole('button', { name: 'Confirm' })).toBeNull();
    const link = within(panel).getByRole('link', { name: 'Open the full conversation to confirm this change.' });
    expect(link.getAttribute('href')).toBe(`/c/${C}/ask/${T}`);
  });
});
