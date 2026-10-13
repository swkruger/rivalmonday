import Link from 'next/link';
import { Fragment } from 'react';
import { evidenceHref } from '@/components/evidence-chips';

/** Spec "Ask": only exact lowercase `[ev:<uuid-ish>]` markers become chips; anything else stays plain text. */
const MARKER = /\[(ev):([0-9a-f-]{36})\]/g;
const REASON = 'Possible reason:';
const MAX_SAVE_EVIDENCE = 10;

export type AnswerSegment = { kind: 'text'; text: string } | { kind: 'chip'; id: string; n: number } | { kind: 'reason' };

function pushText(out: AnswerSegment[], text: string): void {
  if (!text) return;
  const parts = text.split(REASON);
  parts.forEach((part, i) => {
    if (i > 0) out.push({ kind: 'reason' });
    if (part) out.push({ kind: 'text', text: part });
  });
}

/**
 * Splits an answer into paragraphs of segments. A marker is a chip only when it matches exactly and its `ev:<id>` is
 * in the message's `citations`; chips are numbered in first-appearance order (a repeated id keeps its number).
 */
export function parseAnswer(content: string, citations: readonly string[]): AnswerSegment[][] {
  const allowed = new Set(citations);
  const numbers = new Map<string, number>();
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const out: AnswerSegment[] = [];
      let last = 0;
      for (const m of paragraph.matchAll(MARKER)) {
        const ref = `${m[1]}:${m[2]}`;
        if (!allowed.has(ref)) continue;
        pushText(out, paragraph.slice(last, m.index));
        const id = m[2]!;
        if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
        out.push({ kind: 'chip', id, n: numbers.get(id)! });
        last = m.index! + m[0].length;
      }
      pushText(out, paragraph.slice(last));
      return out;
    });
}

/** The evidence ids an answer cites (`ev:` refs only, unique, in order), capped at `add_recommendation`'s 10. */
export function evidenceIdsOf(citations: readonly string[]): string[] {
  const ids: string[] = [];
  for (const c of citations) {
    if (!c.startsWith('ev:')) continue;
    const id = c.slice(3);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_SAVE_EVIDENCE);
}

/** An answer with its markers replaced by plain text (for the save dialog's prefill). */
export function plainAnswer(content: string): string {
  return content.replace(MARKER, '').replace(/ {2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

/** An assistant answer: numbered evidence chips and a muted "Possible reason:" label. No `'use client'` — safe in both hosts. */
export function AskAnswer({ clientId, content, citations }: { clientId: string; content: string; citations: readonly string[] }) {
  return (
    <div className="flex flex-col gap-2 leading-relaxed">
      {parseAnswer(content, citations).map((segments, i) => (
        <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
          {segments.map((s, j) => (
            <Fragment key={j}>
              {s.kind === 'text' && s.text}
              {s.kind === 'reason' && <span className="font-semibold text-muted-foreground">{REASON}</span>}
              {s.kind === 'chip' && (
                <Link
                  href={evidenceHref(clientId, s.id)}
                  aria-label={`Evidence ${s.n}`}
                  className="mx-0.5 inline-grid min-w-5 place-items-center rounded-md bg-primary-soft px-1.5 align-baseline text-xs font-semibold text-primary-soft-text hover:underline"
                >
                  {s.n}
                </Link>
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
