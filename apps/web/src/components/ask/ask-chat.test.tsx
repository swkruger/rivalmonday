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

const base = { clientId: C, threadId: T, assistantName: 'Friday', productName: 'Rival Monday', starters: [], confirmAction, saveAction };

beforeEach(() => {
  confirmAction.mockReset();
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
    expect(screen.getByText('Save recommendation: "confirmed"').closest('div.rounded-xl')).toBeNull();
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
