export type FetchJsonResult = { ok: true; body: unknown } | { ok: false; error: string; status?: number };

const isAbort = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
};

/** GET JSON with a timeout. Never reads or returns an error body (it may echo secrets). */
export async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<FetchJsonResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, error: isAbort(e) ? 'timeout' : 'network error' };
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  try {
    return { ok: true, body: await res.json() };
  } catch (e) {
    return { ok: false, error: isAbort(e) ? 'timeout' : 'bad response' };
  }
}
