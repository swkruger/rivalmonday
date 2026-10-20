import 'server-only';
import { gatewayFor } from '@cs/billing';
import { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile, type Ai } from '@cs/ai';
import { type AccessContext, ToolError, type ToolRegistry } from '@cs/core';
import { catalogRows, createLedgerSink, type Db, type EnvName } from '@cs/db';
import { deliveryConfigFromEnv } from '@cs/engine';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { createCatalog } from '@cs/verticals';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { dbs } from './db';
import { processGuardOn } from './dev-guard';
import { webEmailTransport } from './email-transport';
import { webEnv } from './env';
import { perEnv } from './env-cache';
import { enqueueFor, jobStatusFor, queueStatsFor } from './queue';
import { platformAdmins } from './runtime-env';
import { runbookTailorerFor } from './runbook-tailor';
import { tagRequest } from './sentry-tags';
import { nowMs, profilingOn, recordToolTiming } from './tool-timing';
import { setupLookupFor } from './setup-lookup';
import { webStore } from './store';
import { verticalDrafterFor } from './vertical-draft';

/**
 * P16: query embeddings for `search` exist only in the `dev` environment with an OpenRouter key (DEMO/TEST/E2E never
 * call OpenRouter). The AI client is built lazily on the first query; a failure there makes `search` fall back to FTS.
 */
function embedQueryFor(name: EnvName, service: Db): ToolDeps['embedQuery'] {
  if (name !== 'dev' || !process.env.OPENROUTER_API_KEY) return undefined;
  let ai: Promise<Ai> | undefined;
  return async (text, scope) => {
    ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(process.env, cfg, createLedgerSink(service)));
    const client = await ai.catch((e: unknown) => {
      ai = undefined; // do not cache a failed build
      throw e;
    });
    const r = await client.embed('embeddings', [text], scope);
    return r.vectors[0]!;
  };
}

/**
 * Final-review I1: every dependency is resolved by the environment the registry is built for, never by the live
 * one at call time — a DEMO request still in flight when the owner switches to DEV must not enqueue on cs_dev.
 * Also handed to the MCP server.
 */
export const toolDeps = perEnv((name: EnvName): ToolDeps => {
  const { app, service } = dbs(name);
  const store = webStore(name);
  const catalog = createCatalog(() => catalogRows(service), { ttlMs: 60_000 });
  return {
    app,
    service,
    catalog,
    delivery: deliveryConfigFromEnv(process.env),
    enqueue: enqueueFor(name),
    jobStatus: jobStatusFor(name),
    queueStats: queueStatsFor(name),
    sentryIssuesUrl: webEnv().sentry?.issuesUrl,
    webMonitoring: webEnv().webMonitoring,
    kbImportEnabled: webEnv().kbImport,
    platformAdmins: platformAdmins(name),
    appUrl: webEnv().appUrl,
    // Phase 11c: decline/assign send their lead mail directly after commit; the transport is built per environment (ledger = this env's db).
    leadEmail: { transport: webEmailTransport(processGuardOn(), process.env, createLedgerSink(service)), appUrl: webEnv().appUrl, fromAddress: webEnv().emailFrom, platformAdmins: platformAdmins(name) },
    evidenceStore: { get: (key) => store.get(key), put: (key, body, contentType) => store.put(key, body, contentType) },
    embedQuery: embedQueryFor(name, service),
    setupLookup: setupLookupFor(name, service, { fake: webEnv().setupFakeLookup, processEnv: process.env }),
    verticalDrafter: verticalDrafterFor(name, service, catalog, { fake: webEnv().setupFakeLookup, processEnv: process.env }),
    runbookTailorer: runbookTailorerFor(name, service, catalog, { fake: webEnv().setupFakeLookup, processEnv: process.env }),
    billing: gatewayFor(webEnv().stripe ?? {}, name) ?? undefined, // R27: absent = billing not configured
  };
});

const registries = perEnv((name: EnvName) => createToolRegistry(toolDeps(name)));
/** The live environment's registry, or the named environment's when `name` is given. */
export const registry = (name?: EnvName) => registries(name);

/**
 * Controller requirement: `permission_denied` and `not_found` must become a 404, never a 403 or a page that
 * distinguishes "exists but not yours" from "does not exist" (spec §11, no cross-tenant existence leaks).
 * `invalid_input` is hidden too — a malformed id (e.g. from a tampered URL segment) must not surface differently
 * from a real id that does not resolve for this viewer. Every other code (rate_limited, quota_exceeded, internal)
 * propagates to the route's error boundary. Phase 8b: `read_only_session` (a write tool reached from a page render
 * inside a support session) is a refusal too, so it 404s like the others instead of a 500.
 */
export function isHiddenToolError(e: unknown): boolean {
  return e instanceof ToolError
    && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input' || e.code === 'read_only_session');
}

/** The request's `x-rm-path`, '' outside a request. Only read while profiling. */
async function requestPath(): Promise<string> {
  try {
    return (await headers()).get('x-rm-path') ?? '';
  } catch {
    return '';
  }
}

/**
 * Task 9 (spec D7): `registry.invoke`, timed into `.profile/tools.ndjson` when the server runs with `PROFILE_TOOLS=1`
 * (see `tool-timing.ts`); otherwise exactly `invoke`.
 */
async function invokeTimed(reg: () => Pick<ToolRegistry<ToolDeps>, 'invoke'>, ctx: AccessContext, name: string, input: unknown): Promise<unknown> {
  if (!profilingOn()) return reg().invoke(ctx, name, input);
  const path = await requestPath();
  const startMs = nowMs();
  try {
    return await reg().invoke(ctx, name, input);
  } finally {
    recordToolTiming({ path, tool: name, startMs, endMs: nowMs() });
  }
}

export async function callTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T> {
  await tagRequest(ctx, input);
  try {
    return (await invokeTimed(registry, ctx, name, input)) as T;
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
}

/**
 * For a page's *selected* item whose id comes from the URL (`?event=`, `?move=`): a stale, retracted, foreign or
 * malformed id gives `null` — all alike, so nothing leaks about other tenants — and the page shows "no longer
 * available" instead of a 404. Page-level gates (client access, flags) must still use `callTool`.
 */
export function createTryCallTool(reg: () => Pick<ToolRegistry<ToolDeps>, 'invoke'>) {
  return async function tryCallTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T | null> {
    try {
      return (await invokeTimed(reg, ctx, name, input)) as T;
    } catch (e) {
      if (isHiddenToolError(e)) return null;
      throw e;
    }
  };
}

export const tryCallTool = createTryCallTool(registry);
