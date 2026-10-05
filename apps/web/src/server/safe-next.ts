/** Review Focus 2: only same-origin absolute paths survive; everything else is "/". */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  try {
    const u = new URL(raw, 'http://local.invalid');
    if (u.origin !== 'http://local.invalid') return '/';
    // `new URL` collapses dot segments (including %2e/%2E-encoded ones), which can turn e.g. `/.//evil.com` into
    // the protocol-relative path `//evil.com` — re-validate the *normalised* output, not just the raw input.
    const out = `${u.pathname}${u.search}${u.hash}`;
    if (out[0] !== '/' || out[1] === '/' || out[1] === '\\' || out.includes('\\')) return '/';
    return out;
  } catch {
    return '/';
  }
}
