// @vitest-environment jsdom
import type { AskMessageView } from '@cs/tools';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const finalFrame = `data: ${JSON.stringify({ type: 'final', messageId: '44444444-4444-4444-8444-444444444444', content: 'Acme cut prices.', citations: [], action: null, status: 'ok' })}\n\n`;
const turnResponse = () => new Response(finalFrame, { status: 200, headers: { 'x-ask-thread-id': '22222222-2222-4222-8222-222222222222' } });
const { AskChat, readAskStream } = await import('./ask-chat');
const { ConfirmCard } = await import('./confirm-card');

const C = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const confirmAction = vi.fn();
const saveAction = vi.fn();

const msg = (over: Partial<AskMessageView> = {}): AskMessageView => ({
  id: '33333333-3333-4333-8333-333333333333', role: 'assistant', content: 'Acme cut prices.', citations: [], status: 'ok', action: null,
  createdAt: '2026-10-12T10:00:00.000Z', ...over,
});

const refsAction = vi.fn();
const REF = { source: 'Smith HVAC', channel: 'Pricing page', date: 'Oct 20, 2026' };
const base = { clientId: C, threadId: T, assistantName: 'Friday', productName: null as string | null, starters: [], confirmAction, saveAction, refs: {} as Record<string, typeof REF>, scopeLabel: 'Acme HVAC', refsAction };

beforeEach(() => {
  confirmAction.mockReset();
  refsAction.mockReset();
  saveAction.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

describe('AskChat', () => {
  it('disclosure hidden when review not allowed', () => {
    const { unmount } = render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    expect(screen.queryByText(/may be reviewed/)).toBeNull();
    unmount();
    render(<AskChat {...base} productName="Summit Insights" reviewAllowed messages={[]} />);
    expect(screen.getByText('Conversations may be reviewed by Summit Insights to improve answers.')).toBeTruthy();
  });

  it('composer line without review reads "Only you can see your conversations."', () => {
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    expect(screen.getByText('Only you can see your conversations.')).toBeTruthy();
  });

  it('composer line with review keeps the disclosure', () => {
    render(<AskChat {...base} productName="Summit Insights" reviewAllowed messages={[]} />);
    expect(screen.getByText('Conversations may be reviewed by Summit Insights to improve answers.')).toBeTruthy();
    expect(screen.queryByText('Only you can see your conversations.')).toBeNull();
  });

  it('15a §2.10 fix 1: no white-label name → "our support team" (platform staff review, 6b e5/e6), never a product name', () => {
    const { container } = render(<AskChat {...base} productName={null} reviewAllowed messages={[]} />);
    expect(screen.getByText('Conversations may be reviewed by our support team to improve answers.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/rival[\s-]*monday/i);
  });

  it('save button only with citations', () => {
    render(
      <AskChat
        {...base}
        reviewAllowed={false}
        messages={[
          msg({ id: '33333333-3333-4333-8333-000000000001', content: 'Nothing cited.' }),
          msg({ id: '33333333-3333-4333-8333-000000000002', content: `Acme cut prices [ev:${E1}].`, citations: [`ev:${E1}`] }),
        ]}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Save as recommendation' })).toHaveLength(1);
  });

  it('confirm card only for proposed', () => {
    const action = (state: 'proposed' | 'confirmed' | 'cancelled') => ({ tool: 'add_recommendation', summary: `Save recommendation: "${state}"`, state });
    render(
      <AskChat
        {...base}
        reviewAllowed={false}
        messages={[
          msg({ id: '33333333-3333-4333-8333-000000000001', role: 'action', content: 'Save recommendation: "proposed"', action: action('proposed') }),
          msg({ id: '33333333-3333-4333-8333-000000000002', role: 'action', content: 'Save recommendation: "confirmed"', action: action('confirmed') }),
          msg({ id: '33333333-3333-4333-8333-000000000003', role: 'action', content: 'Save recommendation: "cancelled"', action: action('cancelled') }),
          msg({ id: '33333333-3333-4333-8333-000000000004', role: 'action', content: 'Cancelled.' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    // The proposed summary appears once (in the card); settled actions are plain history lines.
    expect(screen.getAllByText('Save recommendation: "proposed"')).toHaveLength(1);
    expect(screen.getByText('Save recommendation: "confirmed"').closest('[data-slot="ask-confirm"]')).toBeNull();
    expect(screen.getByText('Cancelled.')).toBeTruthy();
  });

  it('shows starter chips only on an empty thread', () => {
    render(<AskChat {...base} threadId={null} reviewAllowed={false} messages={[]} starters={['What changed at my competitors this week?']} />);
    expect(screen.getByRole('button', { name: 'What changed at my competitors this week?' })).toBeTruthy();
  });

  it('prefills the input from initialQuestion without sending', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<AskChat {...base} threadId={null} reviewAllowed={false} messages={[]} initialQuestion="What does this tell us?" />);
    expect((screen.getByLabelText('Ask Friday a question') as HTMLTextAreaElement).value).toBe('What does this tell us?');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('q param auto-sends once', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => turnResponse());
    vi.stubGlobal('fetch', fetchMock);
    const props = { ...base, threadId: null, reviewAllowed: false, messages: [], initialQuestion: 'What changed this week?', autoSend: true };
    const { rerender } = render(<AskChat {...props} />);
    await act(async () => {});
    rerender(<AskChat {...props} />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ clientId: C, question: 'What changed this week?' });
    expect(router.replace).toHaveBeenCalledWith(`/c/${C}/ask`);
    vi.unstubAllGlobals();
  });

  it('seed param pre-fills, does not send', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => turnResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<AskChat {...base} threadId={null} reviewAllowed={false} messages={[]} initialQuestion="What does this tell us?" seedEvidenceId={E1} />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Ask Friday a question') as HTMLTextAreaElement).value).toBe('What does this tell us?');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ clientId: C, question: 'What does this tell us?', seedEvidenceId: E1 });
    vi.unstubAllGlobals();
  });

  it('streams a turn: progress status, then the final answer, then follows the new thread', async () => {
    const frames = [
      `data: ${JSON.stringify({ type: 'progress', label: 'Searching changes…' })}\n\n`,
      `data: ${JSON.stringify({ type: 'final', messageId: '44444444-4444-4444-8444-444444444444', content: 'Acme cut prices.', citations: [], action: null, status: 'ok' })}\n\n`,
    ];
    let push!: (s: string | null) => void;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        push = (s) => (s === null ? c.close() : c.enqueue(enc.encode(s)));
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'x-ask-thread-id': T } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AskChat {...base} threadId={null} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ clientId: C, question: 'What changed?' });
    await act(async () => push(frames[0]!));
    expect((await screen.findByRole('status')).textContent).toContain('Searching changes…');
    await act(async () => {
      push(frames[1]!);
      push(null);
    });
    expect(await screen.findByText('Acme cut prices.')).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith(`/c/${C}/ask/${T}`);
    vi.unstubAllGlobals();
  });

  it('a failed request shows the error copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(await screen.findByText("Friday couldn't answer just now — please try again.")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('AskChat page restyle', () => {
  const ev = (id: string, n = '1') => msg({ id: `33333333-3333-4333-8333-00000000000${n}`, content: `Acme cut prices [ev:${id}].`, citations: [`ev:${id}`] });
  it('user and assistant messages carry data-slots; the badge is the label size', () => {
    const { container } = render(
      <AskChat {...base} reviewAllowed={false} messages={[msg({ id: '33333333-3333-4333-8333-000000000009', role: 'user', content: 'Hi' }), msg()]} />,
    );
    expect(container.querySelector('[data-slot="ask-user-message"]')!.textContent).toBe('Hi');
    const answer = container.querySelector('[data-slot="ask-answer"]')!;
    expect(answer.querySelector('[data-slot="friday-badge"]')!.getAttribute('data-size')).toBe('label');
  });
  it('shows a SourcesList only for resolved refs', () => {
    const { container, rerender } = render(<AskChat {...base} reviewAllowed={false} messages={[ev(E1)]} />);
    expect(container.querySelector('[data-slot="sources-list"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Evidence 1' })).toBeTruthy();
    rerender(<AskChat {...base} reviewAllowed={false} messages={[ev(E1)]} refs={{ [E1]: REF }} />);
    expect(container.querySelector('[data-slot="sources-list"]')!.textContent).toContain('Smith HVAC · Pricing page');
    expect(screen.getByRole('link', { name: 'Evidence 1: Smith HVAC, Oct 20, 2026' })).toBeTruthy();
  });
  it('resolves refs once for a streamed final with a new ev id and the pill gains its source', async () => {
    const frame = `data: ${JSON.stringify({ type: 'final', messageId: '44444444-4444-4444-8444-444444444444', content: `Acme cut prices [ev:${E1}].`, citations: [`ev:${E1}`], action: null, status: 'ok' })}\n\n`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(frame, { status: 200, headers: { 'x-ask-thread-id': T } })));
    refsAction.mockResolvedValue({ [E1]: REF });
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(refsAction).toHaveBeenCalledTimes(1);
    expect(refsAction).toHaveBeenCalledWith(C, [E1]);
    expect(await screen.findByRole('link', { name: 'Evidence 1: Smith HVAC, Oct 20, 2026' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('a rejecting refsAction keeps the fallback pill', async () => {
    const frame = `data: ${JSON.stringify({ type: 'final', messageId: '44444444-4444-4444-8444-444444444444', content: `Acme cut prices [ev:${E1}].`, citations: [`ev:${E1}`], action: null, status: 'ok' })}\n\n`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(frame, { status: 200, headers: { 'x-ask-thread-id': T } })));
    refsAction.mockRejectedValue(new Error('down'));
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(refsAction).toHaveBeenCalledTimes(1);
    await act(async () => { await refsAction.mock.results[0]!.value.catch(() => {}); });
    expect(await screen.findByRole('link', { name: 'Evidence 1' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('composer: send button named Ask is disabled while empty; scope chip shows the client name', () => {
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'x' } });
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('[data-slot="tag"]')!.textContent).toBe('Acme HVAC');
    // Pins the class merge: the borderless composer textarea must not keep the control recipe's border and padding.
    const cls = ` ${screen.getByLabelText('Ask Friday a question').className} `;
    expect(cls).toContain(' border-0 ');
    expect(cls).not.toContain(' border ');
    expect(cls).not.toContain(' px-3 ');
  });
});

describe('AskChat network failure', () => {
  it("a network failure shows the error copy and doesn't refresh", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(await screen.findByText("Friday couldn't answer just now — please try again.")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('AskChat deleted thread', () => {
  it('a 404 turn into an existing thread opens a new conversation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    render(<AskChat {...base} reviewAllowed={false} messages={[]} />);
    fireEvent.change(screen.getByLabelText('Ask Friday a question'), { target: { value: 'What changed?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask' })));
    expect(router.replace).toHaveBeenCalledWith('/c/11111111-1111-4111-8111-111111111111/ask');
    expect(screen.queryByText("Friday couldn't answer just now — please try again.")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('ConfirmCard', () => {
  it('runs the confirm action and shows a refusal', async () => {
    confirmAction.mockResolvedValue({ ok: false, error: 'Not found' });
    render(<ConfirmCard messageId={T} action={{ tool: 'submit_feedback', summary: 'Rate this change as useful', state: 'proposed' }} confirmAction={confirmAction} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(confirmAction).toHaveBeenCalledWith(T, 'confirm');
    expect(screen.getByRole('alert').textContent).toBe('Not found');
  });

  it('renders nothing unless proposed; a failed action shows its error', () => {
    const { container, rerender } = render(<ConfirmCard messageId={T} action={{ tool: 'submit_feedback', summary: 's', state: 'confirmed' }} confirmAction={confirmAction} />);
    expect(container.innerHTML).toBe('');
    rerender(<ConfirmCard messageId={T} action={{ tool: 'submit_feedback', summary: 's', state: 'failed', error: 'Every evidence id must be one you can see' }} confirmAction={confirmAction} />);
    expect(screen.getByRole('alert').textContent).toContain('Every evidence id must be one you can see');
  });

  it('a failure already stored in thread history is passive: role=status, no focus', () => {
    render(<ConfirmCard messageId={T} action={{ tool: 'submit_feedback', summary: 's', state: 'failed', error: 'Old failure' }} confirmAction={confirmAction} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Old failure');
    expect(document.activeElement).toBe(document.body);
  });
});

describe('readAskStream', () => {
  it('parses frames split across chunks', async () => {
    const enc = new TextEncoder();
    const parts = ['data: {"type":"progress","lab', 'el":"A"}\n\ndata: {"type":"progress","label":"B"}\n', '\n'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });
    const seen: unknown[] = [];
    await readAskStream(body, (e) => seen.push(e));
    expect(seen).toEqual([{ type: 'progress', label: 'A' }, { type: 'progress', label: 'B' }]);
  });
});
