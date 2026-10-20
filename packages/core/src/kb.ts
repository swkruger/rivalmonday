/** Phase 6c knowledge-base helpers (pure): placeholder rendering, platform-article lint and retrieval chunking. */
export const KB_LEVELS = ['platform', 'agency', 'client'] as const;
export type KbLevel = (typeof KB_LEVELS)[number];
export const KB_KINDS = ['help', 'playbook', 'qa', 'blog', 'fact'] as const;
export type KbKind = (typeof KB_KINDS)[number];
export const KB_MAX_CHUNKS = 200;
export const KB_CHUNK_CHARS = 1500;
export const KB_MAX_BODY_BYTES = 204_800;

/** The agency's name in client-facing text when it has no white-label name: never the Rival Monday brand. */
export const NEUTRAL_AGENCY_NAME = 'your agency';

/**
 * What `{{client}}` (KB) / `{client}` (web short copy) reads when no client name is known: the client's own people read
 * about "your business"; agency staff and operators read about "the client".
 */
export function clientFallbackFor(clientFacing: boolean): string {
  return clientFacing ? 'your business' : 'the client';
}

export interface KbNames { productName: string; assistantName: string; clientName?: string; clientFallback?: string }

/**
 * Replaces `{{product}}` / `{{assistant}}` / `{{client}}` (inner whitespace allowed); any other `{{x}}` stays literal.
 * `{{client}}` renders `clientFallback` (default "your business") when no `clientName` is given.
 */
export function renderKbText(text: string, names: KbNames): string {
  return text.replace(/\{\{\s*(product|assistant|client)\s*\}\}/g, (_m, k: string) =>
    k === 'product' ? names.productName : k === 'assistant' ? names.assistantName : names.clientName?.trim() || (names.clientFallback ?? clientFallbackFor(true)),
  );
}

/** Platform articles must use placeholders, not the literal brand names. Other levels are never linted. */
export function lintKbText(level: KbLevel, text: string): string[] {
  if (level !== 'platform') return [];
  const out: string[] = [];
  if (/\brival\s+monday\b/i.test(text)) out.push('Uses "Rival Monday": write {{product}} so white-label agencies see their own name.');
  if (/\bfriday\b/i.test(text)) out.push('Uses "Friday": write {{assistant}} so renamed assistants show their own name.');
  return out;
}

type Block = { kind: 'heading'; level: number; title: string } | { kind: 'para'; text: string };

function toBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) blocks.push({ kind: 'para', text });
    buf = [];
  };
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      buf.push(line);
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      buf.push(line);
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: 'heading', level: h[1]!.length, title: h[2]! });
    } else if (line.trim() === '') flush();
    else buf.push(line);
  }
  flush();
  return blocks;
}

/** Hard-splits text into pieces of at most `max` chars, preferring the last sentence end before the limit. */
function hardSplit(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = -1;
    for (const m of win.matchAll(/[.?!] /g)) cut = m.index! + 1;
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function chunkMarkdown(md: string): { chunks: string[]; truncated: boolean } {
  const chunks: string[] = [];
  const path: string[] = [];
  let section: string[] = [];
  const emit = () => {
    const prefix = path.length ? `${path.join(' › ')}\n\n` : '';
    const room = Math.max(1, KB_CHUNK_CHARS - prefix.length);
    let cur = '';
    const push = () => {
      if (cur.trim()) chunks.push(prefix + cur);
      cur = '';
    };
    for (const para of section) {
      for (const piece of para.length > room ? hardSplit(para, room) : [para]) {
        if (cur && cur.length + 2 + piece.length > room) push();
        cur = cur ? `${cur}\n\n${piece}` : piece;
      }
    }
    push();
    section = [];
  };
  const levels: number[] = [];
  for (const b of toBlocks(md)) {
    if (b.kind === 'para') {
      section.push(b.text);
      continue;
    }
    emit();
    while (levels.length && levels[levels.length - 1]! >= b.level) {
      levels.pop();
      path.pop();
    }
    levels.push(b.level);
    path.push(b.title);
  }
  emit();
  return chunks.length > KB_MAX_CHUNKS ? { chunks: chunks.slice(0, KB_MAX_CHUNKS), truncated: true } : { chunks, truncated: false };
}
