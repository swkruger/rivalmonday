'use client';
import type { AskEvent } from '@cs/ask';
import type { AskActionView, AskMessageView } from '@cs/tools';
import { Button, cn, FridayBadge, SourcesList, Tag, textareaClass } from '@cs/ui';
import { ArrowUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from 'react';
import type { EvidenceRefs } from '@/server/evidence-refs';
import { AskAnswer, answerMarkdown, answerSources, citedEvidenceIds, evidenceIdsOf } from './answer';
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
/** P8: a proposed write in the docked panel links to its thread (Confirm/Cancel only on the full page). */
const PANEL_CONFIRM_COPY = 'Open the full conversation to confirm this change.';

export type AskChatState = {
  threadId: string | null;
  setThreadId: Dispatch<SetStateAction<string | null>>;
  turns: LocalTurn[];
  setTurns: Dispatch<SetStateAction<LocalTurn[]>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  progress: string;
  setProgress: Dispatch<SetStateAction<string>>;
  localRefs: EvidenceRefs;
  setLocalRefs: Dispatch<SetStateAction<EvidenceRefs>>;
  keyRef: MutableRefObject<number>;
};

/**
 * The conversation state for turns streamed in this browser session. The page owns its own (`AskChat` calls this); the
 * docked panel's lives in `FridayDock` (P7), so the transcript and thread id survive the panel closing, page navigation
 * and the column/sheet switch, and a turn still streaming when the panel closes lands when it reopens.
 */
export function useAskChatState(initialThreadId: string | null = null): AskChatState {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(WORKING);
  const [localRefs, setLocalRefs] = useState<EvidenceRefs>({});
  const keyRef = useRef(0);
  return { threadId, setThreadId, turns, setTurns, busy, setBusy, progress, setProgress, localRefs, setLocalRefs, keyRef };
}

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
  /** Display refs for the evidence ids cited in `messages`, resolved on the server. */
  refs: EvidenceRefs;
  /** The client's name, shown as the composer's scope chip. */
  scopeLabel: string;
  /**
   * `page` (the full Ask page, default) or the docked `panel` (P7): local turns only, the thread id from
   * `x-ask-thread-id` sent on later turns, no router navigation/refresh, and a proposed write links to the full thread.
   */
  mode?: 'page' | 'panel';
  /** Panel only: the dock-owned conversation state (`useAskChatState`). */
  state?: AskChatState;
  /** Resolves refs for evidence cited by an answer streamed in this session (a failure keeps the fallback pills). */
  refsAction: (clientId: string, ids: string[]) => Promise<EvidenceRefs>;
}

function MessageItem({ m, clientId, assistantName, confirmAction, saveAction, refs, size, threadHref }: { m: ChatMessage; clientId: string; assistantName: string; confirmAction: ConfirmAskAction; saveAction: SaveRecommendationAction; refs: EvidenceRefs; size: 'page' | 'panel'; threadHref: string }) {
  if (m.role === 'user') {
    return (
      <div data-slot="ask-user-message" className="max-w-[85%] self-end whitespace-pre-line rounded-lg bg-muted-surface px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">
        {m.content}
      </div>
    );
  }
  // A proposed write (e8) is stored as an `action` message whose content is the summary: the confirm card shows it
  // while proposed (and the error once failed); afterwards it is a muted history line like "Saved." / "Cancelled.".
  if (m.action && m.id && (m.action.state === 'proposed' || m.action.state === 'failed')) {
    if (size === 'panel') {
      return (
        <div data-slot="ask-panel-action" className="flex flex-col gap-1 text-sm">
          <p className="text-ink">{m.content}</p>
          <p>
            <Link href={threadHref} className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {PANEL_CONFIRM_COPY}
            </Link>
          </p>
        </div>
      );
    }
    return (
      <div className="max-w-[92%]">
        <ConfirmCard messageId={m.id} action={m.action} confirmAction={confirmAction} />
      </div>
    );
  }
  if (m.role === 'action' || m.action) {
    return <p className="text-center text-xs text-muted-ink">{m.content}</p>;
  }
  const evidenceIds = m.status === 'ok' ? evidenceIdsOf(m.citations) : [];
  const prefill = evidenceIds.length > 0 ? savePrefill(m.content) : null;
  const sources = m.status === 'ok' ? answerSources(answerMarkdown(m.content, m.citations).cites, refs, clientId) : [];
  return (
    <article data-slot="ask-answer" className="flex flex-col gap-2.5">
      <div>
        <FridayBadge name={assistantName} size="label" />
      </div>
      <div className={m.status === 'ok' ? 'text-ink' : 'text-muted-ink'}>
        <AskAnswer clientId={clientId} content={m.content} citations={m.citations} refs={refs} size={size} />
      </div>
      {sources.length > 0 && <SourcesList items={sources} />}
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
  const { clientId, assistantName, productName, reviewAllowed, messages, starters, confirmAction, saveAction, scopeLabel, refsAction } = props;
  const panel = props.mode === 'panel';
  const size = panel ? 'panel' : 'page';
  const router = useRouter();
  const [input, setInput] = useState(props.initialQuestion ?? '');
  const own = useAskChatState(props.threadId);
  const st = panel && props.state ? props.state : own;
  const { turns, setTurns, busy, setBusy, progress, setProgress, localRefs, setLocalRefs, keyRef } = st;
  // The page's thread comes from the URL (`AskScreen` keys the chat by it); the panel's from the turn response.
  const threadId = panel ? st.threadId : props.threadId;
  const threadHref = threadId ? `/c/${clientId}/ask/${threadId}` : `/c/${clientId}/ask`;
  const refs = { ...props.refs, ...localRefs };
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const seedRef = useRef(props.seedEvidenceId);
  const autoSent = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const serverIds = new Set(messages.map((m) => m.id));
  const pendingTurns = turns.filter((t) => !(t.final?.id && serverIds.has(t.final.id)));
  const empty = messages.length === 0 && pendingTurns.length === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: panel ? 'nearest' : 'end' });
  }, [messages.length, turns, busy, panel]);

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
        if (panel && got.threadId) st.setThreadId(got.threadId);
        await readAskStream(res.body, (e) => {
          if (e.type === 'progress') setProgress(e.label);
          else got.final ??= e;
        });
      }
    } catch {
      // network failure: the error copy below
    }
    if (gone) {
      setBusy(false);
      if (panel) {
        // The panel's thread was deleted elsewhere: start over here, keeping the question to send again.
        st.setThreadId(null);
        setTurns([]);
        setInput(question);
        return;
      }
      setTurns((ts) => ts.filter((t) => t.key !== key));
      router.replace(`/c/${clientId}/ask`);
      return;
    }
    const f = got.final;
    const final: ChatMessage = f
      ? { id: f.messageId, role: f.action ? 'action' : 'assistant', content: f.content, citations: f.citations, status: f.status, action: actionView(f.action) }
      : { id: null, role: 'assistant', content: errorCopy(assistantName), citations: [], status: 'error', action: null };
    setTurns((ts) => ts.map((t) => (t.key === key ? { ...t, final } : t)));
    setBusy(false);
    // Pills for evidence this answer cites that the server has not resolved: one lookup; a failure keeps "Evidence n".
    const missing = final.status === 'ok' ? citedEvidenceIds(final.citations).filter((id) => !refsRef.current[id]) : [];
    if (missing.length > 0) {
      void refsAction(clientId, missing).then(
        (r) => setLocalRefs((prev) => ({ ...prev, ...r })),
        () => {},
      );
    }
    // A pre-persistence error has no message id: nothing to reload, the local copy stays. The panel never navigates.
    if (final.id === null || panel) return;
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
    <section
      // The panel's aside/dialog already carries the "Ask {assistant}" name.
      aria-label={panel ? undefined : `Ask ${assistantName}`}
      data-mode={size}
      className={cn('flex min-w-0 flex-1 flex-col', panel ? 'min-h-0' : 'min-h-[60vh]')}
    >
      <div className={cn('flex w-full flex-1 flex-col pb-4', panel ? 'min-h-0 gap-5 overflow-y-auto' : 'mx-auto max-w-[680px] gap-6')}>
        {empty && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-ink">
              Ask <FridayBadge name={assistantName} size="label" /> about your competitors and market. Every answer links to its evidence.
            </p>
            <StarterChips questions={starters} onPick={(q) => void send(q)} disabled={busy} />
          </div>
        )}
        {messages.map((m) => (
          <MessageItem key={m.id} m={m} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} refs={refs} size={size} threadHref={threadHref} />
        ))}
        {pendingTurns.map((t) => (
          <div key={`local-${t.key}`} className="flex flex-col gap-6">
            <MessageItem m={{ id: null, role: 'user', content: t.question, citations: [], status: 'ok', action: null }} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} refs={refs} size={size} threadHref={threadHref} />
            {t.final && <MessageItem m={t.final} clientId={clientId} assistantName={assistantName} confirmAction={confirmAction} saveAction={saveAction} refs={refs} size={size} threadHref={threadHref} />}
          </div>
        ))}
        {busy && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-muted-ink">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {progress}
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className={cn('w-full bg-surface pb-1 pt-3', !panel && 'sticky bottom-0 mx-auto max-w-[680px]')}>
        <div className="rounded-md border border-input p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
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
            className={cn(textareaClass, 'min-h-11 resize-none rounded-none border-0 bg-transparent p-0 focus-visible:outline-0')}
          />
          <div className="mt-2 flex items-center gap-2">
            <Tag className="max-w-40 shrink-0 truncate">{scopeLabel}</Tag>
            <p className="min-w-0 flex-1 text-xs text-muted-ink">{reviewAllowed ? disclosureCopy(productName) : 'Only you can see your conversations.'}</p>
            <Button type="submit" size="icon-sm" aria-label="Ask" disabled={busy || !input.trim()}>
              <ArrowUp aria-hidden />
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
