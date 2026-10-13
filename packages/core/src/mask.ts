/** `john@acme.com` → `j•••@acme.com`; no `@` → `•••`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

/** An e-mail address inside free text (local part up to whitespace/brackets/quotes; domain labels without a trailing dot). */
const EMAIL_IN_TEXT = /[^\s@<>()[\]"',;:]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/g;

/** Masks every e-mail substring with `maskEmail`: `Ann <ann@x.io>` → `Ann <a•••@x.io>`; text without one is returned unchanged. */
export function maskEmailsIn(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (m) => maskEmail(m));
}

function parsePath(path: string): { key: string | null; each: boolean }[] {
  return path.split('.').flatMap((seg) => {
    const parts: { key: string | null; each: boolean }[] = [];
    let s = seg;
    let each = 0;
    while (s.endsWith('[]')) { s = s.slice(0, -2); each++; }
    if (s !== '') parts.push({ key: s, each: false });
    for (let i = 0; i < each; i++) parts.push({ key: null, each: true });
    return parts;
  });
}

function applyPath(node: unknown, steps: { key: string | null; each: boolean }[], i: number): unknown {
  if (i === steps.length) return typeof node === 'string' ? maskEmailsIn(node) : node;
  const step = steps[i]!;
  if (step.each) {
    if (!Array.isArray(node)) return node;
    return node.map((n) => applyPath(n, steps, i + 1));
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const rec = node as Record<string, unknown>;
  if (!(step.key! in rec)) return node;
  return { ...rec, [step.key!]: applyPath(rec[step.key!], steps, i + 1) };
}

/** Masks every e-mail inside the string at each dot path (`[]` = every array element) with `maskEmailsIn`, so a plain name stays as it is. Non-strings/absent paths are untouched; returns a structural copy of the branches it masks (the input is never mutated; unmasked branches are shared by reference). */
export function maskSupportFields<T>(output: T, paths: readonly string[]): T {
  let out: unknown = output;
  for (const p of paths) out = applyPath(out, parsePath(p), 0);
  return out as T;
}
