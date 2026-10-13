import { appPath } from '@cs/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_TEXT_CHARS = 1500;
/** Not part of what a row states: links and evidence ids (those are `ev:` citations of their own). */
const SKIP_KEYS = new Set(['url', 'evidenceIds', 'evidence_ids', 'metadata']);

/** An `app:` citation's grounding text (the row as JSON) and the in-app page its chip opens. */
export type AppDatum = { text: string; path: string };

/** A tool link as an in-app path: root-relative kept, absolute http(s) reduced to path and query, anything else null. */
export function appLinkPath(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

/**
 * Adds every citable app row in a tool result to `out` (`app:<id>` → row text + page): a node with a uuid `id` and a
 * `url`, or a top-level competitor profile (`competitorId`, no `id`), which opens the competitor's page. The row's own
 * figures (counts, scores, ratings) are what an `[app:<id>]` sentence is checked against.
 */
export function collectAppData(result: unknown, clientId: string, out: Map<string, AppDatum>, depth = 0): void {
  if (depth > 8 || result === null || typeof result !== 'object') return;
  if (Array.isArray(result)) {
    for (const r of result) collectAppData(r, clientId, out, depth + 1);
    return;
  }
  const node = result as Record<string, unknown>;
  let id: string | null = null;
  let path: string | null = null;
  if (typeof node.id === 'string' && UUID.test(node.id) && typeof node.url === 'string') {
    id = node.id;
    path = appLinkPath(node.url);
  } else if (depth === 0 && !('id' in node) && typeof node.competitorId === 'string' && UUID.test(node.competitorId)) {
    id = node.competitorId;
    path = appPath({ t: 'competitor', clientId, id });
  }
  if (id && path) {
    const key = `app:${id.toLowerCase()}`;
    const text = JSON.stringify(node, (k, v: unknown) => (SKIP_KEYS.has(k) ? undefined : v)).slice(0, APP_TEXT_CHARS);
    const prev = out.get(key);
    if (!prev) out.set(key, { text, path });
    else if (!prev.text.includes(text)) out.set(key, { ...prev, text: `${prev.text}\n${text}`.slice(0, APP_TEXT_CHARS * 2) });
  }
  for (const [k, v] of Object.entries(node)) if (k !== 'metadata' && v && typeof v === 'object') collectAppData(v, clientId, out, depth + 1);
}

/** Stored citation for an `app:` ref: `app:<id>@<path>`, so the answer can link it without a lookup. */
export function withAppPaths(citations: readonly string[], appData: ReadonlyMap<string, AppDatum>): string[] {
  return citations.map((c) => {
    const d = c.startsWith('app:') ? appData.get(c) : undefined;
    return d ? `${c}@${d.path}` : c;
  });
}
