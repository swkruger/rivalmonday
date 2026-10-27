import { isAgencyRole } from '@cs/core';
import { type AlertSummary, type BriefSummary, type ClientProfile, encodeCursor, type ReportSummary } from '@cs/tools';
import { StatusChip, TabsLink, TabsLinkList } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { type EmptyCopy, PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { one, type SearchParams } from '@/server/search-params';
import { callTool } from '@/server/tools';
import { formatDate } from '@/lib/format';
import { ALERT_STATUS, BRIEF_STATUS, type LabelEntry, labelFor, REPORT_STATUS } from '@/lib/labels';
import { type BriefsTab, TABS } from './copy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Briefs & reports' };

const HELP_KEY = 'page:client.briefs';
const COPY = PAGE_COPY['client.briefs'];
/** The teaching empty state of each tab (later pages read "Nothing more to show."). */
const EMPTY_STATE: Record<BriefsTab, EmptyCopy> = { briefs: COPY.empty.noBriefs, alerts: COPY.empty.noAlerts, reports: COPY.empty.noReports };

const PER_PAGE = 20;
/** The list cursor stops at offset 1,000,000. */
const MAX_PAGE = 50_000;

type Ctx = Awaited<ReturnType<typeof requireContext>>['ctx'];
type Paged<T> = { items: T[]; nextCursor?: string | null };
/** `date`: a delivery date, an ISO timestamp or (an unsent report) its quarter — formatted at render. */
interface Row { id: string; href: string; date: string; summary: string; tag: string | null; status: LabelEntry }
interface TabPage { rows: Row[]; hasMore: boolean }

const parseTab = (v: string | undefined): BriefsTab => (TABS.some((t) => t.key === v) ? (v as BriefsTab) : 'briefs');
function parsePage(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}
const hrefFor = (clientId: string, tab: BriefsTab, page = 1) => `/c/${clientId}/briefs?tab=${tab}${page > 1 ? `&page=${page}` : ''}`;

/**
 * One tab's page of rows. Briefs and alerts page through their tools' cursor; `list_trend_reports` returns every report
 * (one a quarter), so it is sliced here.
 */
async function loadTab(ctx: Ctx, tab: BriefsTab, clientId: string, page: number): Promise<TabPage> {
  const offset = (page - 1) * PER_PAGE;
  const paged = { clientId, limit: PER_PAGE, ...(offset ? { cursor: encodeCursor(offset) } : {}) };
  if (tab === 'briefs') {
    const r = await callTool<Paged<BriefSummary>>(ctx, 'list_briefs', paged);
    return {
      hasMore: Boolean(r.nextCursor),
      rows: r.items.map((b) => ({
        id: b.id, href: `/c/${clientId}/briefs/${b.id}`, date: b.deliveryDate, summary: b.summary,
        tag: b.kind === 'starting_point' ? 'Starting point' : null, status: labelFor(BRIEF_STATUS, b.status),
      })),
    };
  }
  if (tab === 'alerts') {
    const r = await callTool<Paged<AlertSummary>>(ctx, 'list_alerts', paged);
    return {
      hasMore: Boolean(r.nextCursor),
      rows: r.items.map((a) => ({
        id: a.id, href: `/c/${clientId}/alerts/${a.id}`, date: a.deliveredAt ?? a.createdAt, summary: `${a.competitorName} — ${a.headline}`,
        tag: null, status: labelFor(ALERT_STATUS, a.status),
      })),
    };
  }
  const r = await callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId });
  return {
    hasMore: r.items.length > offset + PER_PAGE,
    rows: r.items.slice(offset, offset + PER_PAGE).map((x) => ({
      id: x.id, href: `/c/${clientId}/reports/${x.id}`, date: x.sentAt ?? x.quarter, summary: `Competitor trends — ${x.quarter}`,
      tag: null, status: labelFor(REPORT_STATUS, x.status),
    })),
  };
}

/**
 * Spec §2.8: weekly briefs, alerts and quarterly reports in URL-driven tabs (`?tab=`, `?page=`), 20 a page through the
 * existing list tools and their role filtering (client roles only ever get delivered items). Status chips are for
 * agency roles only.
 */
export default async function BriefsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const tab = parseTab(one(sp.tab));
  const page = parsePage(one(sp.page));
  const { ctx } = await requireContext();
  const agency = isAgencyRole(ctx.role);
  const [profile, { rows, hasMore }, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    loadTab(ctx, tab, clientId, page),
    helpGuides(ctx, 'client', clientId),
  ]);

  return (
    <>
      <PageHeader
        title="Briefs & reports"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Act', 'Briefs & reports')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <TabsLinkList aria-label="Briefs and reports views" className="max-w-full overflow-x-auto">
          {TABS.map((t) => (
            <TabsLink key={t.key} asChild active={t.key === tab} className="flex-none px-3">
              <Link href={hrefFor(clientId, t.key)}>{t.label}</Link>
            </TabsLink>
          ))}
        </TabsLinkList>
        <HelpTip tip="client.briefs.kinds" />
        {agency && <HelpTip tip="client.briefs.status" />}
      </div>

      {rows.length === 0 ? (
        page === 1 ? (
          <EmptyState {...EMPTY_STATE[tab]} />
        ) : (
          <p className="text-muted-ink">Nothing more to show.</p>
        )
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex min-w-0 items-center gap-3 px-3 py-3 hover:bg-muted-surface">
                <span className="w-28 shrink-0 font-semibold tabular-nums">{formatDate(r.date, { tz: profile.timezone })}</span>
                {r.tag && <StatusChip tone="info" className="shrink-0">{r.tag}</StatusChip>}
                <span className="min-w-0 flex-1 truncate text-muted-ink">{r.summary}</span>
                {agency && <StatusChip tone={r.status.tone} className="shrink-0">{r.status.label}</StatusChip>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={hrefFor(clientId, tab, page - 1)} className="font-semibold text-primary-soft-text">Newer</Link> : <span />}
          {hasMore && <Link href={hrefFor(clientId, tab, page + 1)} className="font-semibold text-primary-soft-text">Older</Link>}
        </nav>
      )}
    </>
  );
}
