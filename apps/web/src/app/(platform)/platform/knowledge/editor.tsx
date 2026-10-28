'use client';
import type { KbKind, KbLevel } from '@cs/core';
import { Band, Button, nativeInputClass, Section, textareaClass } from '@cs/ui';
import { useActionState, useState } from 'react';
import { KbArticleView } from '@/components/kb/article-view';
import type { FormResult } from '@/server/forms';
import { type KbTargets, ScopeFields } from './scope-fields';
import { ErrorNote } from '@/components/form-error';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;
export interface EditorArticle {
  id: string;
  title: string;
  level: KbLevel;
  agencyId: string | null;
  clientId: string | null;
  kind: KbKind;
  bodyMd: string;
  previousBodyMd: string | null;
  status: 'draft' | 'published';
  clientVisible: boolean;
  source: 'manual' | 'url' | 'seed';
  sourceUrl: string | null;
  autoSync: boolean;
  syncError: string | null;
}
export interface EditorActions { save: Action; remove: Action; autoSync: Action }

const inputClass = `${nativeInputClass} w-full`;

function Notice({ result }: { result: FormResult }) {
  if (!result.ok) return <ErrorNote focusKey={result}>{result.error}</ErrorNote>;
  return result.message ? <Band tone="muted" role="status" className="p-3 text-ink">{result.message}</Band> : null;
}

/** New and edit form. Results of all three actions render in one always-mounted place so they survive revalidation. */
export function KbEditor({ article, targets, actions, initialNotice }: { article?: EditorArticle; targets: KbTargets; actions: EditorActions; initialNotice?: string }) {
  const [saved, save, saving] = useActionState(actions.save, (initialNotice ? { ok: true, message: `Saved. Warnings: ${initialNotice}` } : { ok: true }) as FormResult);
  const [removed, remove, removing] = useActionState(actions.remove, { ok: true } as FormResult);
  const [synced, sync, syncing] = useActionState(actions.autoSync, { ok: true } as FormResult);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.bodyMd ?? '');
  const [confirming, setConfirming] = useState(false);
  const [level, setLevel] = useState<KbLevel>(article?.level ?? 'platform');

  if (article?.source === 'seed') {
    return (
      <div className="flex flex-col gap-4">
        <Band tone="muted" className="p-3 text-ink">Managed in repo</Band>
        <div className="rounded-md border border-line p-6">
          <KbArticleView article={{ kbId: article.id, title: article.title, kind: article.kind, level: article.level, bodyMd: article.bodyMd, sourceUrl: null, updatedAt: new Date().toISOString() /* format-gate: preview of text not yet saved, so today is its date */ }} />
        </div>
      </div>
    );
  }

  const isUrl = article?.source === 'url';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Notice result={saved} />
        <Notice result={removed} />
        <Notice result={synced} />
      </div>
      <form action={save} className="flex flex-col gap-4">
        {article && <input type="hidden" name="id" value={article.id} />}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Title
          <input name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <ScopeFields targets={targets} idPrefix="edit" initial={article ?? {}} onLevel={setLevel} />
        </div>
        {level === 'agency' && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="clientVisible" defaultChecked={article?.clientVisible ?? true} /> Visible to client users
          </label>
        )}
        <div className="flex flex-col gap-2">
          <div role="tablist" className="flex gap-1 text-sm font-semibold">
            {(['write', 'preview'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-primary-soft text-primary-soft-text' : 'text-muted-ink'}`}>
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
          <textarea name="bodyMd" aria-label="Body (Markdown)" rows={18} value={body} onChange={(e) => setBody(e.target.value)} hidden={tab !== 'write'} className={`${textareaClass} p-3 font-mono`} />
          {tab === 'preview' && (
            <div aria-label="Preview" className="rounded-md border border-line p-4">
              <KbArticleView article={{ kbId: article?.id ?? 'preview', title, kind: article?.kind ?? 'help', level, bodyMd: body, sourceUrl: null, updatedAt: new Date().toISOString() /* format-gate: preview of text not yet saved, so today is its date */ }} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="draft" variant="outline" disabled={saving}>Save draft</Button>
          <Button type="submit" name="intent" value="publish" disabled={saving}>Publish</Button>
          {article?.status === 'published' && <Button type="submit" name="intent" value="unpublish" variant="outline" disabled={saving}>Unpublish</Button>}
        </div>
      </form>

      {isUrl && article && (
        <Section ruled>
          <a href={article.sourceUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-sm text-secondary underline [overflow-wrap:anywhere]">{article.sourceUrl}</a>
          <form action={sync} className="flex items-center gap-3">
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="autoSync" value={article.autoSync ? 'false' : 'true'} />
            <span className="text-sm font-semibold">Auto-sync: {article.autoSync ? 'on' : 'off'}</span>
            <Button type="submit" variant="outline" disabled={syncing}>{article.autoSync ? 'Turn off auto-sync' : 'Turn on auto-sync'}</Button>
          </form>
          {article.syncError && <p className="text-sm text-danger">{article.syncError}</p>}
          {article.previousBodyMd !== null && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Previous version</summary>
              <Band tone="muted" className="mt-2 p-3 text-sm"><pre className="whitespace-pre-wrap">{article.previousBodyMd}</pre></Band>
            </details>
          )}
        </Section>
      )}

      {article && (
        <Section ruled>
          {!confirming ? (
            <Button type="button" variant="outline" className="self-start" onClick={() => setConfirming(true)}>Delete</Button>
          ) : (
            <form action={remove} role="alertdialog" aria-label="Confirm delete" className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
              <input type="hidden" name="id" value={article.id} />
              <span className="text-sm">Delete this article and its search index? This cannot be undone.</span>
              <Button type="submit" disabled={removing}>Delete article</Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            </form>
          )}
        </Section>
      )}
    </div>
  );
}
