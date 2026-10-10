import { type EnvName, isEnvName, redactSecrets } from '@cs/db';
import { isLocalHost, requestGuardOn } from '@/server/dev-guard';
import { GUEST_COOKIE } from '@/server/guest';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

/** Required on every panel POST (forces a CORS preflight a foreign page cannot pass) and set on every panel response. */
export const PANEL_HEADER = 'x-rm-dev-panel';

export interface PanelLink {
  label: string;
  email?: string;
  url: string;
}

export interface PanelDeps {
  env(): EnvName;
  setEnv(name: EnvName): Promise<void>;
  clearCaches(): Promise<void>;
  links(name: EnvName, origin: string): Promise<PanelLink[]>;
  /**
   * Progress lines of a child process; the last line is `exit <code>`. Aborting `signal` kills the child; the lines
   * still end with its exit, and only once it has exited.
   */
  run(command: 'reset' | 'snapshot', signal?: AbortSignal): AsyncIterable<string>;
  signIn(req: Request, token: string): Promise<Response>;
}

const notFound = () => new Response('Not found', { status: 404 });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', [PANEL_HEADER]: 'handler' } });
const AUTH_COOKIE = /^(__Secure-)?better-auth\./;

/**
 * Review Focus 2: a POST needs the panel header and an `Origin` naming this very local host. Browsers send `Origin`
 * on every POST, so a missing one means the request did not come from the panel.
 */
function localPost(req: Request, host: string): boolean {
  if (req.headers.get(PANEL_HEADER) !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    return isLocalHost(o.host) && o.host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

/** Spec 5.2 switch step 3: end every session (Better Auth, email-link guest, membership pick). */
function clearSessionCookies(req: Request, res: Response): void {
  const names = (req.headers.get('cookie') ?? '').split(';').map((c) => c.split('=')[0]!.trim()).filter(Boolean);
  for (const n of names) {
    if (AUTH_COOKIE.test(n) || n === GUEST_COOKIE || n === MEMBERSHIP_COOKIE) res.headers.append('set-cookie', `${n}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }
}

/**
 * Spec 5.2/5.3: every route re-checks all three guard conditions and answers 404 when any fails. The host is the raw
 * `Host` request header, never a forwarded one (controller ruling 1).
 */
export function createPanelHandler(deps: PanelDeps) {
  let resetting = false;
  return async function handle(method: 'GET' | 'POST', req: Request, path: string[]): Promise<Response> {
    const host = req.headers.get('host');
    if (!host || !requestGuardOn(host)) return notFound();
    const [head, ...rest] = path;
    if (method === 'GET' && head === 'sign-in' && rest.length === 1) return deps.signIn(req, rest[0]!);
    if (head !== 'api' || rest.length !== 1) return notFound();
    if (method === 'POST' && !localPost(req, host)) return notFound();
    const origin = new URL(req.url).origin;
    switch (`${method} ${rest[0]}`) {
      case 'GET state':
        return json({ env: deps.env(), resetting });
      case 'GET links': {
        const env = deps.env();
        return json({ env, links: await deps.links(env, origin) });
      }
      case 'POST switch': {
        const body = (await req.json().catch(() => null)) as { env?: unknown } | null;
        if (!isEnvName(body?.env)) return json({ error: 'Unknown environment' }, 400);
        if (resetting) return json({ error: 'A reset is running; switch when it finishes' }, 409);
        // Controller ruling 2: write `.dev-env.json` first, then drop the caches, so nothing rebuilt in between is
        // cached under the old environment.
        await deps.setEnv(body.env);
        await deps.clearCaches();
        const res = json({ env: body.env, links: await deps.links(body.env, origin) });
        clearSessionCookies(req, res);
        return res;
      }
      case 'POST reset': {
        if (deps.env() !== 'demo') return json({ error: 'Reset is only available while DEMO is live' }, 409);
        if (resetting) return json({ error: 'A reset is already running' }, 409);
        resetting = true;
        // Final-review M1: a client that goes away mid-reset kills the child; `resetting` stays true until the child
        // has actually exited (the lines end only then), so no second reset or switch can start over it.
        const abort = new AbortController();
        const lines = deps.run('reset', abort.signal);
        const enc = new TextEncoder();
        let cancelled = false;
        const send = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
          if (!cancelled) controller.enqueue(enc.encode(text));
        };
        req.signal?.addEventListener('abort', () => abort.abort(), { once: true });
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const line of lines) send(controller, `${line}
`);
            } catch (e) {
              send(controller, `error ${redactSecrets(e instanceof Error ? e.message : String(e))}
`);
            } finally {
              resetting = false;
              await deps.clearCaches().catch(() => {}); // the seed replaced every table: drop pooled connections and prepared statements
              if (!cancelled) controller.close();
            }
          },
          cancel() {
            cancelled = true;
            abort.abort();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', [PANEL_HEADER]: 'handler' } });
      }
      case 'POST snapshot': {
        if (deps.env() !== 'dev') return json({ error: 'Snapshots are taken of DEV only' }, 409);
        const output: string[] = [];
        for await (const line of deps.run('snapshot')) output.push(line);
        const folder = output.map((l) => /^Snapshot written to (.+)$/.exec(l)?.[1]).find((f): f is string => !!f) ?? null;
        return json({ ok: output.at(-1) === 'exit 0', folder, output });
      }
      default:
        return notFound();
    }
  };
}
