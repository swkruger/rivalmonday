import type { EnvName } from '@cs/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPanelHandler, type PanelDeps } from './handler';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_PANEL', '1');
});
afterEach(() => vi.unstubAllEnvs());

function setup(env: EnvName = 'dev') {
  let current = env;
  // Resets wait at this gate until the test opens it; once open it stays open, so later resets finish at once.
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  const deps: PanelDeps = {
    env: () => current,
    setEnv: vi.fn(async (n: EnvName) => { current = n; }),
    clearCaches: vi.fn(async () => {}),
    links: vi.fn(async (n: EnvName, origin: string) => [{ label: `${n} link`, url: `${origin}/x` }]),
    run: vi.fn(async function* (cmd: 'reset' | 'snapshot') {
      yield `${cmd} started`;
      if (cmd === 'reset') await gate;
      if (cmd === 'snapshot') yield 'Snapshot written to C:\\repo\\backups\\20261009-140322-cs_dev';
      yield 'exit 0';
    }),
    signIn: vi.fn(async () => new Response(null, { status: 303, headers: { location: '/' } })),
  };
  return { deps, handle: createPanelHandler(deps), release: () => open() };
}

const req = (method: 'GET' | 'POST', path: string, o: { host?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  new Request(`http://${o.host ?? 'localhost:3000'}${path}`, {
    method,
    headers: {
      host: o.host ?? 'localhost:3000',
      ...(method === 'POST' ? { 'x-rm-dev-panel': '1', 'content-type': 'application/json', origin: `http://${o.host ?? 'localhost:3000'}` } : {}),
      ...o.headers,
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });

describe('guard (spec 5.3, Review Focus 2)', () => {
  it('404s every route when any condition fails', async () => {
    const { handle } = setup();
    for (const [k, v] of [['NODE_ENV', 'production'], ['DEV_PANEL', '0']] as const) {
      vi.stubEnv(k, v);
      expect((await handle('GET', req('GET', '/dev-panel/api/state'), ['api', 'state'])).status).toBe(404);
      expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' } }), ['api', 'switch'])).status).toBe(404);
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEV_PANEL', '1');
    }
    expect((await handle('GET', req('GET', '/dev-panel/api/state', { host: '192.168.1.5:3000' }), ['api', 'state'])).status).toBe(404);
    expect((await handle('GET', req('GET', '/dev-panel/sign-in/t', { host: 'evil.example' }), ['sign-in', 't'])).status).toBe(404);
  });

  it('reads the raw Host header only, never X-Forwarded-Host', async () => {
    const { handle, deps } = setup();
    const forwarded = { 'x-forwarded-host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1' };
    expect((await handle('GET', req('GET', '/dev-panel/api/state', { host: 'evil.example', headers: forwarded }), ['api', 'state'])).status).toBe(404);
    expect((await handle('GET', req('GET', '/dev-panel/sign-in/t', { host: 'evil.example', headers: forwarded }), ['sign-in', 't'])).status).toBe(404);
    const post = req('POST', '/dev-panel/api/switch', { host: 'evil.example', body: { env: 'demo' }, headers: { ...forwarded, origin: 'http://localhost:3000' } });
    expect((await handle('POST', post, ['api', 'switch'])).status).toBe(404);
    expect(deps.setEnv).not.toHaveBeenCalled();
    expect(deps.signIn).not.toHaveBeenCalled();
  });

  it('404s a POST without the panel header, without an Origin, or from a foreign origin', async () => {
    const { handle, deps } = setup();
    const noHeader = new Request('http://localhost:3000/dev-panel/api/switch', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }, body: '{"env":"demo"}' });
    expect((await handle('POST', noHeader, ['api', 'switch'])).status).toBe(404);
    const noOrigin = new Request('http://localhost:3000/dev-panel/api/switch', { method: 'POST', headers: { host: 'localhost:3000', 'x-rm-dev-panel': '1' }, body: '{"env":"demo"}' });
    expect((await handle('POST', noOrigin, ['api', 'switch'])).status).toBe(404);
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { origin: 'https://evil.example' } }), ['api', 'switch'])).status).toBe(404);
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { origin: 'null' } }), ['api', 'switch'])).status).toBe(404);
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { origin: 'http://localhost:5173' } }), ['api', 'switch'])).status).toBe(404);
    expect(deps.setEnv).not.toHaveBeenCalled();
  });
});

describe('actions (spec 5.2)', () => {
  it('switch writes the environment, clears caches, signs out and returns the new links', async () => {
    const { handle, deps } = setup();
    const r = req('POST', '/dev-panel/api/switch', { body: { env: 'demo' }, headers: { cookie: 'better-auth.session_token=abc; rm_guest=g; theme=x' } });
    const res = await handle('POST', r, ['api', 'switch']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ env: 'demo', links: [{ label: 'demo link', url: 'http://localhost:3000/x' }] });
    expect(deps.setEnv).toHaveBeenCalledWith('demo');
    expect(deps.clearCaches).toHaveBeenCalled();
    const cleared = res.headers.getSetCookie().map((c) => c.split('=')[0]);
    expect(cleared.sort()).toEqual(['better-auth.session_token', 'rm_guest']);
  });

  it('switch writes .dev-env.json before it clears the caches', async () => {
    const { handle, deps } = setup();
    await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'test' } }), ['api', 'switch']);
    const write = vi.mocked(deps.setEnv).mock.invocationCallOrder[0]!;
    const clear = vi.mocked(deps.clearCaches).mock.invocationCallOrder[0]!;
    expect(write).toBeLessThan(clear);
  });

  it('refuses an unknown environment', async () => {
    const { handle } = setup();
    expect((await handle('POST', req('POST', '/dev-panel/api/switch', { body: { env: 'prod' } }), ['api', 'switch'])).status).toBe(400);
  });

  it('resets only in DEMO, streams the lines, and refuses a second reset while one runs', async () => {
    const dev = setup('dev');
    expect((await dev.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset'])).status).toBe(409);
    const demo = setup('demo');
    const first = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(first.status).toBe(200);
    const second = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'A reset is already running' });
    demo.release();
    expect(await first.text()).toBe('reset started\nexit 0\n');
    expect(demo.deps.clearCaches).toHaveBeenCalled();
    const again = await demo.handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('reset started\nexit 0\n');
  });

  it('aborts the reset when the client goes away, and stays resetting until the child has exited (final-review M1)', async () => {
    const demo = setup('demo');
    let signal!: AbortSignal;
    let exited!: () => void;
    const childExit = new Promise<void>((r) => {
      exited = r;
    });
    demo.deps.run = vi.fn(async function* (_cmd: 'reset' | 'snapshot', s?: AbortSignal) {
      signal = s!;
      yield 'reset started';
      await new Promise((r) => s!.addEventListener('abort', r));
      await childExit;
      yield 'exit 1';
    });
    const handle = createPanelHandler(demo.deps);
    const res = await handle('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(signal.aborted).toBe(true);
    const state = async () => (await (await handle('GET', req('GET', '/dev-panel/api/state'), ['api', 'state'])).json()) as { resetting: boolean };
    expect((await state()).resetting).toBe(true);
    exited();
    await vi.waitFor(async () => expect((await state()).resetting).toBe(false));
  });

  it('redacts secrets from a streamed reset error (final-review M4)', async () => {
    const demo = setup('demo');
    demo.deps.run = vi.fn(async function* () {
      yield 'reset started';
      throw new Error('connect postgresql://owner:hunter2@ep-x.neon.tech/cs_demo failed');
    });
    const res = await createPanelHandler(demo.deps)('POST', req('POST', '/dev-panel/api/reset'), ['api', 'reset']);
    const text = await res.text();
    expect(text).toContain('error connect <redacted> failed');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('neon.tech');
  });

  it('takes a snapshot only in DEV and reports the folder', async () => {
    expect((await setup('demo').handle('POST', req('POST', '/dev-panel/api/snapshot'), ['api', 'snapshot'])).status).toBe(409);
    const res = await setup('dev').handle('POST', req('POST', '/dev-panel/api/snapshot'), ['api', 'snapshot']);
    expect(await res.json()).toMatchObject({ ok: true, folder: 'C:\\repo\\backups\\20261009-140322-cs_dev' });
  });

  it('hands sign-in links to the sign-in flow and 404s unknown paths', async () => {
    const { handle, deps } = setup('demo');
    expect((await handle('GET', req('GET', '/dev-panel/sign-in/tok'), ['sign-in', 'tok'])).status).toBe(303);
    expect(deps.signIn).toHaveBeenCalledWith(expect.any(Request), 'tok');
    expect((await handle('GET', req('GET', '/dev-panel/api/nope'), ['api', 'nope'])).status).toBe(404);
    expect((await handle('GET', req('GET', '/dev-panel/x/y/z'), ['x', 'y', 'z'])).status).toBe(404);
  });
});
