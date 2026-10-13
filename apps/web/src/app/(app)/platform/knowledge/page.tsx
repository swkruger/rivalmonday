import { KB_KINDS, KB_LEVELS, type KbKind, type KbLevel } from '@cs/core';
import Link from 'next/link';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { kbImportStatusAction, startKbImportAction } from './actions';
import { ImportPanel } from './import-panel';
import { KIND_OPTION, type KbTargets, LEVEL_OPTION, selectClass } from './scope-fields';
import { SyncBadge } from './sync-badge';
import type { KbListItem } from './sync-badge';

export const dynamic = 'force-dynamic';

type Params = { level?: string; agencyId?: string; clientId?: string; kind?: string; status?: string; q?: string; cursor?: string };

const SOURCE_BADGE = { manual: 'Manual', url: 'URL', seed: 'Managed in repo' } as const;
const STATUSES = ['draft', 'published'] as const;
const pick = <T extends string>(v: string | undefined, all: readonly T[]): T | undefined => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);

/** Non-operators get the tool's permission_denied → 404. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { ctx } = await requireContext();
  const sp = await searchParams;
  const level: KbLevel | undefined = pick(sp.level, KB_LEVELS);
  const kind: KbKind | undefined = pick(sp.kind, KB_KINDS);
  const status = pick(sp.status, STATUSES);
  const filters = {
    ...(level ? { level } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(sp.agencyId ? { agencyId: sp.agencyId } : {}),
    ...(sp.clientId ? { clientId: sp.clientId } : {}),
    ...(sp.q?.trim() ? { q: sp.q.trim() } : {}),
    ...(sp.cursor ? { cursor: sp.cursor } : {}),
  };
  const page = await callTool<{ items: KbListItem[]; nextCursor: string | null }>(ctx, 'list_kb_articles', { ...filters, limit: 25 });
  const targets = await callTool<KbTargets>(ctx, 'list_kb_targets', {});
  const clients = targets.agencies.filter((a) => !sp.agencyId || a.id === sp.agencyId).flatMap((a) => a.clients);
  const more = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'cursor' && v) as [string, string][]);
  if (page.nextCursor) more.set('cursor', page.nextCursor);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Knowledge</h1>
        <Link href="/platform/knowledge/new" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">New article</Link>
      </div>
      <p className="text-muted-foreground">Articles Friday can search and cite, at platform, agency and client level.</p>
      <form method="get" className="grid gap-2 rounded-[14px] bg-surface p-4 shadow-card md:grid-cols-6">
        <select name="level" aria-label="Level" defaultValue={sp.level ?? ''} className={selectClass}><option value="">All levels</option>{KB_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_OPTION[l]}</option>)}</select>
        <select name="agencyId" aria-label="Agency" defaultValue={sp.agencyId ?? ''} className={selectClass}><option value="">All agencies</option>{targets.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="clientId" aria-label="Client" defaultValue={sp.clientId ?? ''} className={selectClass}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="kind" aria-label="Kind" defaultValue={sp.kind ?? ''} className={selectClass}><option value="">All kinds</option>{KB_KINDS.map((k) => <option key={k} value={k}>{KIND_OPTION[k]}</option>)}</select>
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ''} className={selectClass}><option value="">Any status</option><option value="draft">Draft</option><option value="published">Published</option></select>
        <div className="flex gap-2">
          <input name="q" aria-label="Search" placeholder="Search titles" defaultValue={sp.q ?? ''} className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs" />
          <button type="submit" className="rounded-md border px-3 text-sm font-semibold">Filter</button>
        </div>
      </form>
      {page.items.length === 0 ? (
        <p className="text-muted-foreground">No articles yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {page.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/platform/knowledge/${a.id}`} className="font-semibold text-secondary hover:underline">{a.title}</Link>
                <div className="text-sm text-muted-foreground">
                  {LEVEL_OPTION[a.level]}{a.agencyName ? ` · ${a.agencyName}` : ''}{a.clientName ? ` · ${a.clientName}` : ''} · {KIND_OPTION[a.kind]}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5">{a.status === 'published' ? 'Published' : 'Draft'}</span>
                <span className="rounded-full bg-muted px-2 py-0.5">{SOURCE_BADGE[a.source]}</span>
                <SyncBadge a={a} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && <Link href={`/platform/knowledge?${more.toString()}`} className="text-secondary hover:underline">Older articles</Link>}
      {webEnv().kbImport && <ImportPanel targets={targets} start={startKbImportAction} status={kbImportStatusAction} />}
    </>
  );
}
