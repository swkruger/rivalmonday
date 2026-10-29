export type SubmitResult = { ok: true } | { ok: false; reason: 'check' | 'invalid' | 'unavailable' };

/** POSTs to 17a's route. No cookies, no credentials, JSON only (the route allows only `content-type`). Never logs the body. */
export async function submitWaitlist(appUrl: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  const json = JSON.stringify(body);
  if (json.length > 8_000) return { ok: false, reason: 'invalid' }; // route caps at 8 KB
  let res: Response;
  try {
    res = await fetchImpl(new URL('/api/waitlist', appUrl).toString(), {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'strict-origin',
      headers: { 'content-type': 'application/json' }, body: json, signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 200) {
    const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return data?.ok === true ? { ok: true } : { ok: false, reason: 'unavailable' };
  }
  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, reason: data?.error === 'check' ? 'check' : 'invalid' };
  }
  return { ok: false, reason: 'unavailable' }; // 403 (origin), 5xx, anything else
}
