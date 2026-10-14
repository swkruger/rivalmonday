import { vi } from 'vitest';

export const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Stub that rejects like a real fetch when init.signal aborts. */
export const hangingFetch = (): typeof fetch =>
  vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
      }),
  ) as unknown as typeof fetch;

/** Spies on every console method; `output()` returns everything logged so far. */
export function spyConsole() {
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  return {
    output: () => spies.flatMap((s) => s.mock.calls.flat()).map(String).join('\n'),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
