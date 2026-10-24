'use client';
import type { AskEvent } from '@cs/ask';
import type { AskActionView, AskMessageView } from '@cs/tools';
import { Button, FridayBadge } from '@cs/ui';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AskAnswer, evidenceIdsOf } from './answer';
import { type ConfirmAskAction, ConfirmCard } from './confirm-card';
import { type SaveRecommendationAction, SaveRecommendationDialog, savePrefill } from './save-recommendation-dialog';
import { StarterChips } from './starter-chips';

/** Q7: the label before the first tool runs (unknown tools also read "Working…"). */
const WORKING = 'Working…';
const QUESTION_MAX = 2000;
/** Decided copy (spec); `@cs/ask` is server-only, so the client keeps its own copy of these two lines. */
const errorCopy = (assistantName: string) => `${assistantName} couldn't answer just now — please try again.`;
/**
 * Platform staff review threads (6b e5/e6): a white-label `displayName` names that service; without one the copy names no
 * company (15a §2.10 fix 1) — never the agency's legal name, never Rival Monday.
 */
const disclosureCopy = (productName: string | null) => `Conversations may be reviewed by ${productName ?? 'our support team'} to improve answers.`;

type FinalEvent = Extract<AskEvent, { type: 'final' }>;
/** `id` is null for a turn that never persisted (the local error line, the local user echo). */
type ChatMessage = Omit<Pick<AskMessageView, 'id' | 'role' | 'content' | 'citations' | 'status' | 'action'>, 'id'> & { id: string | null };
type LocalTurn = { key: number; question: string; final: ChatMessage | null };

/** Q3: reads `data: <json>\n\n` frames from the turn response; tolerant of frames split across chunks. */
export async function readAskStream(body: ReadableStream<Uint8Array>, onEvent: (e: AskEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (frame: string) => {
    const data = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    try {
      onEvent(JSON.parse(data) as AskEvent);
    } catch {
      // a malformed frame is skipped; the turn's final still arrives or the caller shows the error copy
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      flush(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) flush(buffer);
}

function actionView(a: FinalEvent['action']): AskActionView {
  if (!a) return null;
  return a.error === undefined ? { tool: a.tool, summary: a.summary, state: a.state } : { tool: a.tool, summary: a.summary, state: a.state, error: a.error };
}

export interface AskChatProps {
  clientId: string;
  /** null on `/c/<id>/ask` (the first question starts a thread). */
  threadId: string | null;
  assistantName: string;
  /** The agency's white-label `displayName`, or null when it has none. */
  productName: string | null;
  /** `client.ask_review_allowed` — the disclosure line shows only while true. */
  reviewAllowed: boolean;
  messages: AskMessageView[];
  starters: readonly string[];
  confirmAction: ConfirmAskAction;
  saveAction: SaveRecommendationAction;
  /** Task 10: `?q=` (sent once when `autoSend`) and the evidence viewer's prefilled question (`?seed=`). */
  initialQuestion?: string;
  autoSend?: boolean;
  /** Task 10: grounds the first question on this evidence. */
  seedEvidenceId?: string;
}

function MessageItem({ m, clientId, assistantName, confirmAction, saveAction }: { m: ChatMessage; clientId: string; assistantName: string; confirmAction: ConfirmAskAction; saveAction: SaveRecommendationAction }) {
  if (m.role === 'user') {
    return <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl [overflow-wrap:anywhere] rounded-br-md bg-secondary px-4 py-2.5 text-secondary-foreground">{m.content}</div>;
  }
  // A proposed write (e8) is stored as an `action` message whose content is the summary: the confirm card shows it
  // while proposed (and the error once failed); afterwards it is a muted history line like "Saved." / "Cancelled.".
  if (m.action && m.id && (m.action.state === 'proposed' || m.action.state === 'failed')) {
    return (
      <div className="max-w-[92%]">
        <ConfirmCard messageId={m.id} action={m.action} confirmAction={confirmAction} />
      </div>
    );
  }
  if (m.role === 'action' || m.action) {
    return <p className="text-center text-xs text-muted-foreground">{m.content}</p>;
  }
  const evidenceIds = m.status === 'ok' ? evidenceIdsOf(m.citations) : [];
  const prefill = evidenceIds.length > 0 ? savePrefill(m.content) : null;
  return (
    <article className="flex max-w-[92%] flex-col gap-2.5 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
      <FridayBadge name={assistantName} />
      <div className={m.status === 'ok' ? '' : 'text-muted-foreground'}>
        <AskAnswer clientId={clientId} content={m.content} citations={m.citations} />
      </div>
      {prefill && <SaveRecommendationDialog clientId={clientId} evidenceIds={evidenceIds} defaultTitle={prefill.title} defaultRationale={prefill.rationale} saveAction={saveAction} />}
    </article>
  );
}

/**
 * The Ask conversation (spec "Web", Q3): stored messages from the server, plus the turn in flight streamed from
 * `POST /api/ask/turn`. Once the turn's final is persisted the page is refreshed (or, for a new thread, replaced with
 * `/c/<id>/ask/<threadId>` from `x-ask-thread-id`), and the local copy drops out when the server list has it.
 */
export function AskChat(props: AskChatProps) {
  const { clientId, threadId, assistantName, productName, reviewAllowed, messages, starters, confirmAction, saveAction } = props;
  const router = useRouter();
  const [input, setInput] = useState(props.initialQuestion ?? '');
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(WORKING);
  const seedRef = useRef(props.seedEvidenceId);
  const keyRef = useRef(0);
  const autoSent = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const serverIds = new Set(messages.map((m) => m.id));
  const pendingTurns = turns.filter((t) => !(t.final?.id && serverIds.has(t.final.id)));
  const empty = messages.length === 0 && pendingTurns.length === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, turns, busy]);

  async function send(raw: string): Promise<void> {
    const question = raw.trim().slice(0, QUESTION_MAX);
    if (!question || busy) return;
    const key = ++keyRef.current;
    setBusy(true);
    setProgress(WORKING);
    setInput('');
    setTurns((ts) => [...ts, { key, question, final: null }]);

    const got: { final: FinalEvent | null; threadId: string | null } = { final: null, threadId: null };
    let gone = false;
    try {
      const seed = seedRef.current;
      seedRef.current = undefined;
      const res = await fetch('/api/ask/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, ...(threadId ? { threadId } : {}), question, ...(seed ? { seedEvidenceId: seed } : {}) }),
      });
      // P5: the thread was deleted (here or in another tab): start a new conversation instead of an error.
      gone = threadId !== null && res.status === 404;
      if (res.ok && res.body) {
        got.threadId = res.headers.get('x-ask-thread-id');
        await readAskStream(res.body, (e) => {
          if (e.type === 'progress') setProgress(e.label);
          else got.final ??= e;
        });
      }
    } catch {
      // network failure: the error copy below
    }
    if (gone) {
      setTurns((ts) => ts.filter((t) => t.key !== key));
      setBusy(false);
      router.replace(`/c/${clientId}/ask`);
      return;
    }
    const f = got.final;
    const final: ChatMessage = f
      ? { id: f.messageId, role: f.action ? 'action' : 'assistant', content: f.content, citations: f.citations, status: f.status, action: actionView(f.action) }
      : { id: null, role: 'assistant', content: errorCopy(assistantName), citations: [], status: 'error', action: null };
    setTurns((ts) => ts.map((t) => (t.key === key ? { ...t, final } : t)));
    setBusy(false);
    // A pre-persistence error has no message id: nothing to reload, the local copy stays.
    if (final.id === null) return;
    if (!threadId && got.threadId) router.replace(`/c/${clientId}/ask/${got.threadId}`);
    else router.refresh();
  }

  useEffect(() => {
    if (!props.autoSend || !props.initialQuestion || autoSent.current) return;
    autoSent.current = true;
    // Strip `?q=` so a reload or back-navigation never re-asks.
    router.replace(threadId ? `/c/${clientId}/ask/${threadId}` : `/c/${clientId}/ask`);
    void send(props.initialQuestion);
    // Sends once on mount (Task 10's `?q=`); later prop changes never re-send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <section aria-label={`Ask ${assistantName}`} className="flex min-h-[60vh] min-w-0 flex-1 flex-col rounded-[14px] bg-surface shadow-card">
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-5">
        {empty && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              Ask <FridayBadge name={assistantName} /> about your competitors and market. Every answer links to its evidence.
            </p>
            <StarterChips questions={starters} onPick={(q) => void send(q)} disabled={busy} />
          </div>
        )}
        {messages.map((m) => (
          <MessageItem key={m.id} m={m} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} />
        ))}
        {pendingTurns.map((t) => (
          <div key={`local-${t.key}`} className="flex flex-col gap-4">
            <MessageItem m={{ id: null, role: 'user', content: t.question, citations: [], status: 'ok', action: null }} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} />
            {t.final && <MessageItem m={t.final} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} />}
          </div>
        ))}
        {busy && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {progress}
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="sticky bottom-0 flex flex-col gap-2 rounded-b-[14px] border-t border-line bg-surface p-3 lg:p-4">
        <div className="flex items-end gap-2">
          <textarea
            aria-label={`Ask ${assistantName} a question`}
            placeholder={`Ask ${assistantName} a question…`}
            value={input}
            maxLength={QUESTION_MAX}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            className="min-h-11 w-full flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Ask
          </Button>
        </div>
        {reviewAllowed && <p className="text-xs text-muted-foreground">{disclosureCopy(productName)}</p>}
      </form>
    </section>
  );
}
