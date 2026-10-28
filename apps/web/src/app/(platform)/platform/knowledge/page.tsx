import { KB_KINDS, KB_LEVELS, type KbKind, type KbLevel } from '@cs/core';
import { Button, Frame, Section, StatusChip, toolbarControlClass } from '@cs/ui';
import Link from 'next/link';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { KB_ARTICLE_STATUS, labelFor } from '@/lib/labels';
import { requireOperatorContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { kbImportStatusAction, startKbImportAction } from './actions';
import { ImportPanel } from './import-panel';
import { KIND_OPTION, type KbTargets, LEVEL_OPTION } from './scope-fields';
import { SyncBadge } from './sync-badge';
import type { KbListItem } from './sync-badge';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Knowledge' };

const HELP_KEY = 'page:platform.knowledge';
const COPY = PAGE_COPY['platform.knowledge'];

type Params = { level?: string; agencyId?: string; clientId?: string; kind?: string; status?: string; q?: string; cursor?: string };

const SOURCE_BADGE = { manual: 'Manual', url: 'URL', seed: 'Managed in repo' } as const;
const STATUSES = ['draft', 'published'] as const;
const pick = <T extends string>(v: string | undefined, all: readonly T[]): T | undefined => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);

/** Non-operators get the tool's permission_denied → 404. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { ctx } = await requireOperatorContext();
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
  const [targets, guides, tz] = await Promise.all([callTool<KbTargets>(ctx, 'list_kb_targets', {}), helpGuides(ctx, 'platform'), viewerTimeZone()]);
  const clients = targets.agencies.filter((a) => !sp.agencyId || a.id === sp.agencyId).flatMap((a) => a.clients);
  const more = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'cursor' && v) as [string, string][]);
  if (page.nextCursor) more.set('cursor', page.nextCursor);

  return (
    <>
      <PageHeader
        title="Knowledge"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Knowledge' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={<Link href="/platform/knowledge/new" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">New article</Link>}
      />
      <TipRow
        items={[
          { label: 'Levels and kinds', tip: 'platform.knowledge.levels' },
          { label: 'Draft or published', tip: 'platform.knowledge.status' },
          { label: 'Repo articles', tip: 'platform.knowledge.repo' },
          { label: 'URL articles', tip: 'platform.knowledge.sync' },
        ]}
      />
      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="level" aria-label="Level" defaultValue={sp.level ?? ''} className={toolbarControlClass}><option value="">All levels</option>{KB_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_OPTION[l]}</option>)}</select>
        <select name="agencyId" aria-label="Agency" defaultValue={sp.agencyId ?? ''} className={toolbarControlClass}><option value="">All agencies</option>{targets.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="clientId" aria-label="Client" defaultValue={sp.clientId ?? ''} className={toolbarControlClass}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="kind" aria-label="Kind" defaultValue={sp.kind ?? ''} className={toolbarControlClass}><option value="">All kinds</option>{KB_KINDS.map((k) => <option key={k} value={k}>{KIND_OPTION[k]}</option>)}</select>
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ''} className={toolbarControlClass}><option value="">Any status</option><option value="draft">Draft</option><option value="published">Published</option></select>
        <input name="q" aria-label="Search" placeholder="Search titles" defaultValue={sp.q ?? ''} className={`${toolbarControlClass} w-56`} />
        <Button type="submit" variant="outline" size="sm">Filter</Button>
      </form>
      <Section>
      {page.items.length === 0 ? (
        <EmptyState {...COPY.empty.none} guideAnchor="how-to-use-it" />
      ) : (
        <Frame flush><ul className="divide-y divide-line">
          {page.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/platform/knowledge/${a.id}`} className="font-semibold text-secondary hover:underline">{a.title}</Link>
                <div className="text-13 text-muted-ink">
                  {LEVEL_OPTION[a.level]}{a.agencyName ? ` · ${a.agencyName}` : ''}{a.clientName ? ` · ${a.clientName}` : ''} · {KIND_OPTION[a.kind]}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={labelFor(KB_ARTICLE_STATUS, a.status).tone}>{labelFor(KB_ARTICLE_STATUS, a.status).label}</StatusChip>
                <StatusChip tone="neutral">{SOURCE_BADGE[a.source]}</StatusChip>
                <SyncBadge a={a} tz={tz} />
              </div>
            </li>
          ))}
        </ul></Frame>
      )}
      </Section>
      {page.nextCursor && <Link href={`/platform/knowledge?${more.toString()}`} className="text-secondary hover:underline">Older articles</Link>}
      {webEnv().kbImport && <ImportPanel targets={targets} start={startKbImportAction} status={kbImportStatusAction} />}
    </>
  );
}
