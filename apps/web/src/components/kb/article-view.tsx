import type { KbKind, KbLevel } from '@cs/core';
import Markdown from 'react-markdown';

export type KbArticle = { kbId: string; title: string; kind: KbKind; level: KbLevel; bodyMd: string; sourceUrl: string | null; updatedAt: string };

/** Decided copy (spec). */
export const KB_LEVEL_LABEL: Record<KbLevel, string> = { platform: 'Help', agency: 'From your agency', client: 'Your business' };
export const KB_MISSING = 'This article is no longer available.';
const KIND_LABEL: Record<KbKind, string> = { help: 'Help article', playbook: 'Playbook', qa: 'Q&A', blog: 'Blog post', fact: 'Fact' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Markdown only (raw HTML is not rendered); links open in a new tab. Shared by the article view and the page guide sheet. */
export function KbMarkdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 leading-relaxed [overflow-wrap:anywhere] [&_a]:text-secondary [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{children}</Markdown>
    </div>
  );
}

/** Read-only article body shared by the sheet and `/kb/[id]`. Markdown only: raw HTML is not rendered. Safe in server and client trees. */
export function KbArticleView({ article }: { article: KbArticle }) {
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary-soft px-2 py-0.5 font-semibold text-primary-soft-text">{KB_LEVEL_LABEL[article.level]}</span>
        <span className="text-muted-foreground">{KIND_LABEL[article.kind]}</span>
      </div>
      <KbMarkdown>{article.bodyMd}</KbMarkdown>
      {article.sourceUrl && (
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-secondary underline">
          Source
        </a>
      )}
      <p className="text-xs text-muted-foreground">Updated {formatDate(article.updatedAt)}</p>
    </article>
  );
}
