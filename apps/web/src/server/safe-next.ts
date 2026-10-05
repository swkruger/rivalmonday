/** Review Focus 2: only same-origin absolute paths survive; everything else is "/". */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  try {
    const u = new URL(raw, 'http://local.invalid');
    if (u.origin !== 'http://local.invalid') return '/';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '/';
  }
}
