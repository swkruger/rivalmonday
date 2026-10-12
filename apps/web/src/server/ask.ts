import 'server-only';
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { ASK_COPY, type AskDeps, type AskEvent, beginTurn, DEFAULT_ASSISTANT_NAME, runTurn } from '@cs/ask';
import { createScriptedAskAi, type ScriptedReply, type ScriptedStep } from '@cs/ask/testing';
import { type AccessContext, canAccessClient, hasFeature, ToolError } from '@cs/core';
import { agency, client, createDecisionSampleSink, createLedgerSink, type Db, type EnvName, withTenant } from '@cs/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbs } from './db';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { registry, toolDeps } from './tools';
import type { Viewer } from './viewer';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The first evidence id in the last tool result (`<data tool="…">{json}</data>`), with its row title. */
function firstEvidence(content: string): { id: string; title: string } | null {
  const json = /^<data tool="[^"]*">([\s\S]*)<\/data>$/.exec(content)?.[1];
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  for (const item of items as Record<string, unknown>[]) {
    const ids = Array.isArray(item?.evidenceIds) ? item.evidenceIds : [];
    const id = ids.find((x): x is string => typeof x === 'string' && UUID.test(x));
    if (id) return { id, title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'A competitor changed something' };
  }
  return null;
}

/** E2E fake chat: first `search_events` for the turn's client, then an answer citing the first evidence id found. */
function e2eReply(req: { messages: { role: string; content: string | null }[]; toolChoice?: 'auto' | 'none' }): ScriptedReply {
  const last = req.messages.at(-1);
  if (last?.role === 'tool') {
    const ev = firstEvidence(last.content ?? '');
    return { text: ev ? `${ev.title.replace(/[.!?]+$/, '')} [ev:${ev.id}].` : ASK_COPY.noEvidence };
  }
  if (req.toolChoice === 'none') return { text: ASK_COPY.noEvidence };
  const turnLine = req.messages.find((m) => m.role === 'system' && /\(clientId [0-9a-f-]{36}\)/i.test(m.content ?? ''))?.content ?? '';
  const clientId = /\(clientId ([0-9a-f-]{36})\)/i.exec(turnLine)?.[1];
  return { toolCalls: [{ name: 'search_events', args: { clientId, route: 'all', days: 365 } }] };
}

/**
 * Q1: the deterministic Ask script behind `ASK_FAKE_AI=1` (E2E only). Every step repeats, so one script serves every
 * turn: guard in scope → `search_events` → an answer citing the first returned evidence id, every claim supported.
 */
export const E2E_SCRIPT: ScriptedStep[] = [
  { kind: 'guard', verdict: 'in_scope', repeat: true },
  { kind: 'chat', reply: e2eReply, repeat: true },
  { kind: 'support', verdict: true, repeat: true },
];

/** The real AI client per environment (OpenRouter + Jev), built once; a failed build is not cached. */
const realAi = perEnv((name: EnvName) => {
  const { service } = dbs(name);
  let ai: Promise<Ai> | undefined;
  return () =>
    (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH)
      .then((cfg) => createAiFromEnv(process.env, cfg, createLedgerSink(service), createDecisionSampleSink(service)))
      .catch((e: unknown) => {
        ai = undefined;
        throw e;
      }));
});

/**
 * What `runTurn` needs for `name` (default: the live environment). `toolDeps` is the same object the web registry and
 * MCP use, so the evidence-text fallback (`evidenceStore`) works. With `ASK_FAKE_AI` each call gets a fresh scripted AI
 * (its call log never grows across turns).
 */
export async function askDeps(name?: EnvName): Promise<AskDeps> {
  const { app, service } = dbs(name);
  const ai = webEnv().askFakeAi ? createScriptedAskAi(E2E_SCRIPT) : await realAi(name)();
  return { app, service, ai, registry: registry(name), toolDeps: toolDeps(name) };
}

/** e10: the agency's assistant name, "Friday" when unset or blank. */
export async function assistantNameFor(service: Db, agencyId: string): Promise<string> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  const name = row?.branding?.assistantName;
  return typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_ASSISTANT_NAME;
}

/** Spec "Web": the turn request body. */
export const AskTurnBody = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(2000),
  seedEvidenceId: z.string().uuid().optional(),
});
export type AskTurnBody = z.infer<typeof AskTurnBody>;

/** One SSE frame (Q3). */
export function sseFrame(e: AskEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}

const SSE_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' };
const notFound = () => new Response(null, { status: 404 });

/** RLS read: the client exists and this context can see it (an agency role's `clientScope: 'all'` spans only its agency). */
async function clientVisible(app: Db, ctx: AccessContext, clientId: string): Promise<boolean> {
  const rows = await withTenant(app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  return rows.length > 0;
}

export type AskTurnOptions = {
  viewer: Viewer | null;
  deps: () => Promise<AskDeps>;
  /** Keeps the serverless invocation alive until the turn settles (Next `after`); the turn never depends on it. */
  keepAlive?: (turn: Promise<void>) => void;
};

/**
 * `POST /api/ask/turn` (spec "Web", Q2, Q3, Q11). Refusals are an empty 404 (guest, no session, member-less, a client
 * out of scope or without the `ask` feature). Otherwise an SSE stream with exactly one `final`: the quota copy, the
 * turn's own final, or the error copy for anything that throws. The turn runs to completion even if the client
 * disconnects (e1): a closed stream only stops the writes.
 */
export async function handleAskTurn(req: Request, o: AskTurnOptions): Promise<Response> {
  const viewer = o.viewer;
  if (!viewer || viewer.kind !== 'user') return notFound();
  const ctx = viewer.ctx;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const body = AskTurnBody.safeParse(raw);
  if (!body.success) return new Response(null, { status: 400 });
  const input = body.data;
  if (ctx.userId.startsWith('contact:') || !hasFeature(ctx, 'ask') || !canAccessClient(ctx, input.clientId)) return notFound();

  let deps: AskDeps | null = null;
  let begun: Awaited<ReturnType<typeof beginTurn>> | null = null;
  let beginError: unknown = null;
  try {
    deps = await o.deps();
    if (!(await clientVisible(deps.app, ctx, input.clientId))) return notFound();
    begun = await beginTurn(deps.app, ctx, input);
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied')) return notFound();
    if (e instanceof ToolError && e.code === 'invalid_input') return new Response(null, { status: 400 });
    beginError = e;
  }

  const encoder = new TextEncoder();
  let closed = false;
  let finalSent = false;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });
  const write = (e: AskEvent) => {
    if (e.type === 'final') {
      if (finalSent) return;
      finalSent = true;
    }
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(sseFrame(e)));
    } catch {
      closed = true;
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // already closed or errored by the consumer
    }
  };
  req.signal?.addEventListener('abort', () => close(), { once: true });

  const turn = (async () => {
    try {
      if (beginError) throw beginError;
      if (begun!.kind === 'quota') {
        write({ type: 'final', messageId: begun!.messageId, content: ASK_COPY.quota, citations: [], action: null, status: 'quota' });
        return;
      }
      await runTurn(deps!, ctx, { threadId: begun!.threadId, userMessageId: begun!.userMessageId, ...(input.seedEvidenceId ? { seedEvidenceId: input.seedEvidenceId } : {}) }, write);
    } catch (err) {
      console.error('[ask] turn failed', err instanceof Error ? err.message : err);
      if (!finalSent) {
        const name = deps ? await assistantNameFor(deps.service, ctx.agencyId).catch(() => DEFAULT_ASSISTANT_NAME) : DEFAULT_ASSISTANT_NAME;
        write({ type: 'final', messageId: '', content: ASK_COPY.error(name), citations: [], action: null, status: 'error' });
      }
    } finally {
      close();
    }
  })();
  try {
    o.keepAlive?.(turn);
  } catch {
    // outside a request scope (tests): the turn still runs
  }
  // The thread a new question created (or continued), so the page can follow it; absent only when the turn never began.
  const headers = begun ? { ...SSE_HEADERS, 'x-ask-thread-id': begun.threadId } : SSE_HEADERS;
  return new Response(stream, { status: 200, headers });
}
