import Link from 'next/link';
import Markdown from 'react-markdown';
import { evidenceHref } from '@/components/evidence-chips';
import { ArticleSheet } from '@/components/kb/article-sheet';

/** Spec "Ask": only exact lowercase `[ev:<uuid-ish>]` / `[kb:<uuid>]` / `[app:<uuid>]` markers become chips; anything else stays plain text. */
const MARKER = /\[(ev|kb|app):([0-9a-f-]{36})\]/g;
/** A stored `app:` citation carries its in-app page: `app:<id>@/c/...` (never protocol-relative). */
const APP_CITATION = /^app:([0-9a-f-]{36})@(\/(?!\/)\S*)$/;
const REASON = 'Possible reason:';
const MAX_SAVE_EVIDENCE = 10;
const CITE_HREF = /^#cite-(\d+)$/;

export type AnswerCite = { kind: 'ev'; id: string; n: number } | { kind: 'kb'; id: string } | { kind: 'app'; id: string; path: string } | { kind: 'reason' };

/**
 * The answer as Markdown in which every valid marker (and each "Possible reason:" label) is a `#cite-<i>` link into
 * `cites`. A marker counts only when it matches exactly and is in the message's `citations`; evidence chips are
 * numbered in first-appearance order (a repeated id keeps its number).
 */
export function answerMarkdown(content: string, citations: readonly string[]): { markdown: string; cites: AnswerCite[] } {
  const allowed = new Set(citations);
  const appPaths = new Map<string, string>();
  for (const c of citations) {
    const m = APP_CITATION.exec(c);
    if (m) appPaths.set(m[1]!, m[2]!);
  }
  const numbers = new Map<string, number>();
  const cites: AnswerCite[] = [];
  const link = (label: string, cite: AnswerCite) => {
    cites.push(cite);
    return `[${label}](#cite-${cites.length - 1})`;
  };
  const markdown = content
    .replace(MARKER, (m, prefix: string, id: string) => {
      if (prefix === 'app') {
        const path = appPaths.get(id);
        return path ? link('data', { kind: 'app', id, path }) : m;
      }
      if (!allowed.has(`${prefix}:${id}`)) return m;
      if (prefix === 'kb') return link('article', { kind: 'kb', id });
      if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
      return link(String(numbers.get(id)), { kind: 'ev', id, n: numbers.get(id)! });
    })
    .split(REASON)
    .reduce((acc, part, i) => (i === 0 ? part : `${acc}${link('reason', { kind: 'reason' })}${part}`), '');
  return { markdown, cites };
}

/** The evidence ids an answer cites (`ev:` refs only, `kb:`/`app:` excluded, unique, in order), capped at `add_recommendation`'s 10. */
export function evidenceIdsOf(citations: readonly string[]): string[] {
  const ids: string[] = [];
  for (const c of citations) {
    if (!c.startsWith('ev:')) continue;
    const id = c.slice(3);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_SAVE_EVIDENCE);
}

/** An answer with its markers and bold markup removed (for the save dialog's prefill). */
export function plainAnswer(content: string): string {
  return content.replace(MARKER, '').replace(/\*\*/g, '').replace(/ {2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

const chipClass = 'mx-0.5 inline-grid min-w-5 place-items-center rounded-md bg-primary-soft px-1.5 align-baseline text-xs font-semibold text-primary-soft-text hover:underline';

function Cite({ cite, clientId }: { cite: AnswerCite; clientId: string }) {
  switch (cite.kind) {
    case 'reason':
      return <span className="font-semibold text-muted-foreground">{REASON}</span>;
    case 'kb':
      return <ArticleSheet kbId={cite.id} />;
    case 'app':
      return (
        <Link href={cite.path} aria-label="Open in the app" className={chipClass}>
          Data
        </Link>
      );
    case 'ev':
      return (
        <Link href={evidenceHref(clientId, cite.id)} aria-label={`Evidence ${cite.n}`} className={chipClass}>
          {cite.n}
        </Link>
      );
  }
}

/**
 * An assistant answer rendered as Markdown (bold, lists, paragraphs; raw HTML and images never rendered) with numbered
 * evidence chips, Article and Data chips, and a muted "Possible reason:" label. Links the model wrote stay plain text.
 * No `'use client'` — safe in both hosts.
 */
export function AskAnswer({ clientId, content, citations }: { clientId: string; content: string; citations: readonly string[] }) {
  const { markdown, cites } = answerMarkdown(content, citations);
  return (
    <div className="flex flex-col gap-2 leading-relaxed [overflow-wrap:anywhere] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown
        disallowedElements={['img']}
        components={{
          a: ({ href, children }) => {
            const m = CITE_HREF.exec(href ?? '');
            const cite = m ? cites[Number(m[1])] : undefined;
            return cite ? <Cite cite={cite} clientId={clientId} /> : <>{children}</>;
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
