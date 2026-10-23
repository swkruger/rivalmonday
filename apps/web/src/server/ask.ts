import 'server-only';
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { aiPauseOf, ASK_COPY, askPausedCopy, type AskDeps, type AskEvent, beginTurn, DEFAULT_ASSISTANT_NAME, runTurn } from '@cs/ask';
import { createScriptedAskAi, type ScriptedReply, type ScriptedStep } from '@cs/ask/testing';
import { type AccessContext, type AiGuard, canAccessClient, hasChannel, ToolError } from '@cs/core';
import { agency, client, createAiGuard, createDecisionSampleSink, createLedgerSink, type Db, type EnvName, withTenant } from '@cs/db';
import { assertAgencyServiceable } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbs } from './db';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { registry, toolDeps } from './tools';
import type { Viewer } from './viewer';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The first evidence id in the last tool result (`<data tool="…">{json}</data>`), with its row id and title. */
function firstEvidence(content: string): { id: string; itemId: string | null; title: string } | null {
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
    const itemId = typeof item.id === 'string' && UUID.test(item.id) ? item.id : null;
    if (id) return { id, itemId, title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'A competitor changed something' };
  }
  return null;
}

/** The E2E trigger for a proposed write (e8 confirm card): a question containing "as useful". */
const PROPOSE_USEFUL = /\bas useful\b/i;

/** The E2E trigger for a knowledge lookup (6c): "knowledge base: <token>"; the token is the full-text query. */
const KB_LOOKUP = /\bknowledge base:\s*([\p{L}\p{N}_-]+)/iu;

/** The first `search_knowledge` hit in the last tool result (`<data tool="…">{json}</data>`). */
function firstKbHit(content: string): { kbId: string; title: string } | null {
  const json = /^<data tool="[^"]*">([\s\S]*)<\/data>$/.exec(content)?.[1];
  if (!json) return null;
  try {
    const results = (JSON.parse(json) as { results?: unknown } | null)?.results;
    const hit = Array.isArray(results) ? (results as Record<string, unknown>[]).find((r) => typeof r?.kbId === 'string' && UUID.test(r.kbId)) : undefined;
    return hit ? { kbId: hit.kbId as string, title: typeof hit.title === 'string' && hit.title.trim() ? hit.title.trim() : 'A knowledge article' } : null;
  } catch {
    return null;
  }
}

/**
 * E2E fake chat: first `search_events` for the turn's client, then an answer citing the first evidence id found. When
 * the question says "as useful" it instead proposes `submit_feedback` (useful) on the first found event.
 */
function e2eReply(req: { messages: { role: string; content: string | null }[]; toolChoice?: 'auto' | 'none' }): ScriptedReply {
  const turnLine = req.messages.find((m) => m.role === 'system' && /\(clientId [0-9a-f-]{36}\)/i.test(m.content ?? ''))?.content ?? '';
  const clientId = /\(clientId ([0-9a-f-]{36})\)/i.exec(turnLine)?.[1];
  const last = req.messages.at(-1);
  const kbQuery = KB_LOOKUP.exec(req.messages.findLast((m) => m.role === 'user')?.content ?? '')?.[1];
  if (kbQuery) {
    if (last?.role === 'tool') {
      const hit = firstKbHit(last.content ?? '');
      return { text: hit ? `${hit.title.replace(/[.!?]+$/, '')} [kb:${hit.kbId}].` : ASK_COPY.noEvidence };
    }
    if (req.toolChoice === 'none') return { text: ASK_COPY.noEvidence };
    return { toolCalls: [{ name: 'search_knowledge', args: { query: kbQuery, clientId } }] };
  }
  if (last?.role === 'tool') {
    const ev = firstEvidence(last.content ?? '');
    const question = req.messages.findLast((m) => m.role === 'user')?.content ?? '';
    if (ev?.itemId && clientId && PROPOSE_USEFUL.test(question)) {
      return { toolCalls: [{ name: 'submit_feedback', args: { clientId, eventId: ev.itemId, verdict: 'useful' } }] };
    }
    return { text: ev ? `${ev.title.replace(/[.!?]+$/, '')} [ev:${ev.id}].` : ASK_COPY.noEvidence };
  }
  if (req.toolChoice === 'none') return { text: ASK_COPY.noEvidence };
  return { toolCalls: [{ name: 'search_events', args: { clientId, route: 'all', days: 365 } }] };
}

/**
 * Q1: the deterministic Ask script behind `ASK_FAKE_AI=1` (E2E only). Every step repeats, so one script serves every
 * turn: guard in scope → `search_events` → an answer citing the first returned evidence id, every claim supported
 * (or, for an "as useful" question, a proposed `submit_feedback` the user confirms).
 */
export const E2E_SCRIPT: ScriptedStep[] = [
  { kind: 'guard', verdict: 'in_scope', repeat: true },
  { kind: 'chat', reply: e2eReply, repeat: true },
  { kind: 'support', verdict: true, repeat: true },
];

/** 7b1: one spend guard per environment (shared 30 s cache), used by the real `Ai` and by the route's pre-turn check. */
const guardFor = perEnv((name: EnvName) => {
  let guard: AiGuard | undefined;
  return () => (guard ??= createAiGuard(dbs(name).service));
});

/** The real AI client per environment (OpenRouter + Jev), built once; a failed build is not cached. */
const realAi = perEnv((name: EnvName) => {
  const { service } = dbs(name);
  let ai: Promise<Ai> | undefined;
  return () =>
    (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH)
      .then((cfg) => createAiFromEnv(process.env, cfg, createLedgerSink(service), createDecisionSampleSink(service), guardFor(name)()))
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
  return { app, service, ai, registry: registry(name), toolDeps: toolDeps(name), guard: guardFor(name)() };
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
  /** Resolves the viewer; `null` = no client hint (the early gate), else the body's `clientId` picks the membership. */
  viewerFor: (clientId: string | null) => Promise<Viewer | null>;
  deps: () => Promise<AskDeps>;
  /** Keeps the serverless invocation alive until the turn settles (Next `after`); the turn never depends on it. */
  keepAlive?: (turn: Promise<void>) => void;
};

/** 7a2 spec §4: the largest `/api/ask/turn` body, by `Content-Length` and by streamed byte count. */
export const ASK_MAX_BODY_BYTES = 32 * 1024;

/**
 * Reads a JSON body of at most `max` bytes. A larger `Content-Length` is 413 without reading; otherwise the body is
 * streamed and counted (a chunked body has no length), and the stream is cancelled as soon as the count passes `max`.
 * An empty body, a read error, invalid UTF-8 or invalid JSON is 400.
 */
export async function readCappedJson(req: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** The media type of a `content-type` header: before any `;`, trimmed, lower-cased. */
const mediaType = (header: string | null) => (header ?? '').split(';')[0]!.trim().toLowerCase();

/**
 * `POST /api/ask/turn` (spec "Web", Q2, Q3, Q11; 7a2 spec §4 order, Decision 4). Refusals are an empty 404 and come
 * before any body handling: no user viewer, a contact, a plan without Ask, a missing or foreign `Origin`. Then 415 (not
 * JSON), 413 (over 32 KB), 400 (malformed), and the client checks under the membership the body's `clientId` picks
 * (404). Otherwise an SSE stream with exactly one `final`: the quota copy, the turn's own final, or the error copy for
 * anything that throws. The turn runs to completion even if the client disconnects (e1): a closed stream only stops
 * the writes.
 */
export async function handleAskTurn(req: Request, o: AskTurnOptions): Promise<Response> {
  // 1. Early gate with no client hint. A null-hint context may belong to another single-client membership, so the
  //    client-level `ask` feature is checked after parsing, against the hinted viewer.
  const early = await o.viewerFor(null);
  if (!early || early.kind !== 'user' || early.ctx.userId.startsWith('contact:') || !early.ctx.planFeatures.has('ask')) return notFound();

  // 2. CSRF: the browser's `Origin` must name this host. `x-forwarded-host` is deliberately not trusted.
  const host = req.headers.get('host')?.toLowerCase() ?? null;
  let originHost: string | null = null;
  try {
    originHost = new URL(req.headers.get('origin') ?? '').host.toLowerCase();
  } catch {
    originHost = null;
  }
  if (!host || !originHost || originHost !== host) return notFound();

  // 3–4. JSON only, capped by header and by streamed count.
  if (mediaType(req.headers.get('content-type')) !== 'application/json') return new Response(null, { status: 415 });
  const raw = await readCappedJson(req, ASK_MAX_BODY_BYTES);
  if (!raw.ok) return new Response(null, { status: raw.status });

  // 5. Parse, then the client checks under the membership covering the body's client.
  const body = AskTurnBody.safeParse(raw.value);
  if (!body.success) return new Response(null, { status: 400 });
  const input = body.data;
  const viewer = await o.viewerFor(input.clientId);
  if (!viewer || viewer.kind !== 'user') return notFound();
  const ctx = viewer.ctx;
  if (ctx.userId.startsWith('contact:') || !hasChannel(ctx, 'ask') || !canAccessClient(ctx, input.clientId)) return notFound();

  let deps: AskDeps | null = null;
  let begun: Awaited<ReturnType<typeof beginTurn>> | null = null;
  let beginError: unknown = null;
  try {
    deps = await o.deps();
    if (!(await clientVisible(deps.app, ctx, input.clientId))) return notFound();
    // 9a: a read_only/suspended agency is refused before any quota count or model call (role-aware copy).
    await assertAgencyServiceable(deps.service, ctx);
    // 7b1: a spend/platform pause answers with C4/C5 before any quota count or model call (every role).
    const pause = await aiPauseOf(deps.guard, { agencyId: ctx.agencyId, clientId: input.clientId });
    begun = await beginTurn(deps.app, ctx, input, new Date(), { pause });
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
      const b = begun!;
      if (b.kind !== 'ok') {
        const [content, status] = b.kind === 'quota' ? ([ASK_COPY.quota, 'quota'] as const) : ([b.kind === 'busy' ? ASK_COPY.busy : ASK_COPY.paused, 'refused'] as const);
        write({ type: 'final', messageId: b.messageId, content, citations: [], action: null, status });
        return;
      }
      await runTurn(deps!, ctx, { threadId: b.threadId, userMessageId: b.userMessageId, ...(input.seedEvidenceId ? { seedEvidenceId: input.seedEvidenceId } : {}) }, write);
    } catch (err) {
      const paused = askPausedCopy(err);
      if (!paused && !(err instanceof ToolError && err.code === 'service_paused')) console.error('[ask] turn failed', err instanceof Error ? err.message : err);
      if (!finalSent) {
        const name = deps ? await assistantNameFor(deps.service, ctx.agencyId).catch(() => DEFAULT_ASSISTANT_NAME) : DEFAULT_ASSISTANT_NAME;
        const content = paused ?? (err instanceof ToolError && err.code === 'service_paused' ? err.message : ASK_COPY.error(name));
        write({ type: 'final', messageId: '', content, citations: [], action: null, status: 'error' });
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
