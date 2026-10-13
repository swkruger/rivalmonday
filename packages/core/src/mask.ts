/** `john@acme.com` → `j•••@acme.com`; no `@` → `•••`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
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
  if (i === steps.length) return typeof node === 'string' ? maskEmail(node) : node;
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

/** Masks the string at each dot path (`[]` = every array element) with `maskEmail`. Non-strings/absent paths are untouched; returns a structural copy of the branches it masks (the input is never mutated; unmasked branches are shared by reference). */
export function maskSupportFields<T>(output: T, paths: readonly string[]): T {
  let out: unknown = output;
  for (const p of paths) out = applyPath(out, parsePath(p), 0);
  return out as T;
}
