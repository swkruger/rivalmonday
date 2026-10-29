import { execFileSync } from 'node:child_process';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { SURFACES } from '../cli/status.js';
import { collectItems } from '../collect.js';
import { applyAction, LedgerError, loadLedger, saveLedger, type LedgerAction } from '../ledger.js';
import { withStatus } from '../status.js';
import type { CopyItem, ItemStatus, StatusedItem, Surface } from '../types.js';

export interface ServerOptions {
  root: string;
  ledgerPath: string;
  collect?: () => Promise<CopyItem[]>;
  now?: () => string;
  who?: () => string;
}

export const STATUSES: ItemStatus[] = ['unsigned', 'changed', 'signed', 'ignored'];
export const PREVIEW_CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'";
const MAX_BODY = 1_000_000;

export interface ViewFilter { surface?: Surface; status?: ItemStatus[]; q?: string }
export type Counts = Record<ItemStatus | 'needsEdit', number>;
export interface View { filter: ViewFilter; items: StatusedItem[]; counts: Record<Surface, Counts>; total: Counts }

const zeroCounts = (): Counts => ({ unsigned: 0, changed: 0, signed: 0, ignored: 0, needsEdit: 0 });

/** Filtered items + counts per surface × status (counts cover every item, not just the filtered ones). */
export function buildView(items: StatusedItem[], filter: ViewFilter): View {
  const counts = {} as Record<Surface, Counts>;
  for (const s of SURFACES) counts[s] = zeroCounts();
  const total = zeroCounts();
  for (const i of items) {
    for (const c of [(counts[i.surface] ??= zeroCounts()), total]) {
      c[i.status]++;
      if (i.needsEdit) c.needsEdit++;
    }
  }
  const q = filter.q?.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (!filter.surface || i.surface === filter.surface) &&
      (!filter.status || filter.status.includes(i.status)) &&
      (!q || i.text.toLowerCase().includes(q) || i.context.toLowerCase().includes(q) || i.file.toLowerCase().includes(q)),
  );
  return { filter, items: shown, counts, total };
}

/** Query string → filter. Unknown surface/status values are dropped; `status` is a comma list. */
export function parseFilter(params: URLSearchParams, defaultStatus?: ItemStatus[]): ViewFilter {
  const f: ViewFilter = {};
  const surface = params.get('surface');
  if (surface && SURFACES.includes(surface as Surface)) f.surface = surface as Surface;
  const status = params.get('status');
  const list = status === null ? defaultStatus : status.split(',').filter((s): s is ItemStatus => STATUSES.includes(s as ItemStatus));
  if (list && list.length > 0) f.status = list;
  const q = params.get('q');
  if (q) f.q = q.slice(0, 500);
  return f;
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Placeholder until Task 9's `renderPage(view)` (src/server/page.ts) replaces it. */
function renderPlaceholder(view: View): string {
  const t = view.total;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Copy sign-off</title></head><body>
<h1>Copy sign-off</h1>
<p>${escapeHtml(`${view.items.length} shown · unsigned ${t.unsigned} · changed ${t.changed} · signed ${t.signed} · ignored ${t.ignored} · needs edit ${t.needsEdit}`)}</p>
</body></html>`;
}

const itemRef = z.object({ file: z.string().min(1).max(1000), hash: z.string().min(1).max(64) }).strict();
const itemsBody = z.object({ items: z.array(itemRef).min(1).max(5000) }).strict();
const commentBody = itemRef
  .extend({ comment: z.string().trim().min(1).max(5000), suggestion: z.string().max(5000).optional() })
  .strict();

const ITEM_ACTIONS: Record<string, LedgerAction> = {
  '/api/sign': 'sign', '/api/unsign': 'unsign', '/api/ignore': 'ignore', '/api/unignore': 'unignore',
};

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra?: Record<string, unknown>) {
    super(message);
  }
}

function defaultWho(root: string): string {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim() || 'owner';
  } catch {
    return 'owner';
  }
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

function send(res: ServerResponse, status: number, type: string, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': type, ...headers });
  res.end(body);
}
const sendJson = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_BODY) {
      req.resume();
      return reject(new HttpError(413, 'Body too large'));
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.removeAllListeners('data');
        req.resume();
        reject(new HttpError(413, 'Body too large'));
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseJson<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const raw = await readBody(req);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, 'Invalid body', { issues: parsed.error.issues });
  return parsed.data;
}

/**
 * Local sign-off server (spec §7). Throws `LedgerError` when the ledger is malformed, so it never starts on (or
 * overwrites) a broken file. Callers bind it to 127.0.0.1; every request is also checked for Host/Origin.
 */
export function createServer(opts: ServerOptions): Server {
  const { root, ledgerPath } = opts;
  loadLedger(ledgerPath);
  const collect = opts.collect ?? (() => collectItems(root));
  const now = opts.now ?? today;
  const who = opts.who ?? (() => defaultWho(root));

  let cache: CopyItem[] | undefined;
  const scan = async () => (cache = await collect());
  const current = async () => cache ?? scan();
  const statused = (items: CopyItem[]) => withStatus(items, loadLedger(ledgerPath));

  /** Writes run one at a time so two quick clicks can't interleave load/save. */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  async function write(action: LedgerAction, refs: { file: string; hash: string }[], extra?: { comment: string; suggestion?: string }) {
    return serial(async () => {
      const items = await scan();
      const byKey = new Map<string, CopyItem>();
      for (const i of items) if (!byKey.has(`${i.file}\u0000${i.hash}`)) byKey.set(`${i.file}\u0000${i.hash}`, i);
      const unknown = refs.filter((r) => !byKey.has(`${r.file}\u0000${r.hash}`));
      if (unknown.length > 0) throw new HttpError(409, 'Unknown items (the copy changed; reload)', { unknown });
      const targets = refs.map((r) => byKey.get(`${r.file}\u0000${r.hash}`)!);
      const next = applyAction(loadLedger(ledgerPath), action, targets, { at: now(), by: who() }, extra);
      saveLedger(ledgerPath, next);
      return { ok: true, counts: buildView(withStatus(items, next), {}).counts };
    });
  }

  const server = createHttpServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader('connection', 'close');
        sendJson(res, e.status, { error: e.message, ...e.extra });
      }
      else if (e instanceof LedgerError) sendJson(res, 500, { error: e.message });
      else sendJson(res, 500, { error: 'Internal error' });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const port = (server.address() as AddressInfo | null)?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (port === undefined || !allowedHosts.includes(req.headers.host ?? '')) throw new HttpError(403, 'Forbidden host');

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const path = url.pathname;

    if (req.method === 'GET') {
      if (path === '/') {
        const view = buildView(statused(await scan()), parseFilter(url.searchParams, ['unsigned', 'changed']));
        return send(res, 200, 'text/html; charset=utf-8', renderPlaceholder(view));
      }
      if (path === '/api/items') {
        const view = buildView(statused(await current()), parseFilter(url.searchParams));
        return sendJson(res, 200, { items: view.items.map(({ html: _html, ...i }) => i), counts: view.counts, total: view.total });
      }
      const m = /^\/preview\/([^/]+)$/.exec(path);
      if (m) {
        let id: string;
        try {
          id = decodeURIComponent(m[1]!);
        } catch {
          throw new HttpError(404, 'Not found');
        }
        const hit = (await current()).find((i) => (i.anchor === `email:${id}` || i.anchor === `document:${id}`) && i.html !== undefined);
        if (!hit) throw new HttpError(404, 'Not found');
        return send(res, 200, 'text/html; charset=utf-8', hit.html!, { 'content-security-policy': PREVIEW_CSP });
      }
      throw new HttpError(404, 'Not found');
    }

    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin !== undefined && !allowedHosts.some((h) => origin === `http://${h}`)) throw new HttpError(403, 'Forbidden origin');
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (type !== 'application/json') throw new HttpError(403, 'Content-Type must be application/json');

      const action = ITEM_ACTIONS[path];
      if (action) {
        const body = await parseJson(req, itemsBody);
        return sendJson(res, 200, await write(action, body.items));
      }
      if (path === '/api/comment') {
        const body = await parseJson(req, commentBody);
        const extra = body.suggestion ? { comment: body.comment, suggestion: body.suggestion } : { comment: body.comment };
        return sendJson(res, 200, await write('comment', [{ file: body.file, hash: body.hash }], extra));
      }
      throw new HttpError(404, 'Not found');
    }

    throw new HttpError(405, 'Method not allowed');
  }

  return server;
}
