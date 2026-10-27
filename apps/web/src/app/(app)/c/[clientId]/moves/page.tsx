import { hasFeature } from '@cs/core';
import type { ClientProfile, MoveDetail, MoveRow } from '@cs/tools';
import { Card, CardContent } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clientCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { ListDetail } from '@/components/list-detail';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { formatDate } from '@/lib/format';
import { changesHref } from '../changes/params';
import { RoutePill } from '../changes/feed';
import { MoveCard, movesHref } from './move-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Moves' };

const HELP_KEY = 'page:client.moves';
const COPY = PAGE_COPY['client.moves'];

const STATUSES = ['open', 'closed', 'all'] as const;
type Status = (typeof STATUSES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStatus(v: string | string[] | undefined): Status {
  const s = Array.isArray(v) ? v[0] : v;
  return (STATUSES as readonly string[]).includes(s ?? '') ? (s as Status) : 'open';
}

function parseMoveId(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && UUID.test(s) ? s : undefined;
}

function StatusLink({ clientId, status, current, label }: { clientId: string; status: Status; current: Status; label: string }) {
  const active = status === current;
  return (
    <Link
      href={movesHref(clientId, { status })}
      aria-current={active ? 'page' : undefined}
      className={active ? 'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink' : 'rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-ink'}
    >
      {label}
    </Link>
  );
}

function MoveStatusRow({ move, timezone }: { move: MoveDetail; timezone: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>First detected {formatDate(move.firstDetectedAt, { tz: timezone })}</span>
        {move.lastEvidenceAt && <span>Latest evidence {formatDate(move.lastEvidenceAt, { tz: timezone })}</span>}
        {move.closedAt && <span>Closed {formatDate(move.closedAt, { tz: timezone })}</span>}
        <span>Confidence {Math.round(move.confidence * 100)}%</span>
      </div>
      <p className="text-xs text-muted-foreground">Confidence grows with each extra supporting change and each extra channel.</p>
    </div>
  );
}

function EvidenceChain({ clientId, move, timezone }: { clientId: string; move: MoveDetail; timezone: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-ink">Evidence chain</h3>
        <HelpTip tip="client.moves.signals" />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {move.events.map((e) => (
          <li key={e.eventId}>
            <Link
              href={changesHref(clientId, { event: e.eventId, route: 'all', days: 365 })}
              className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 hover:bg-muted-surface"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {e.typeLabel} · {e.summary}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(e.occurredAt, { tz: timezone })}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`font-semibold ${e.route === 'archive' ? 'text-muted-foreground' : 'text-secondary'}`}>{e.score}</span>
                <RoutePill route={e.route} score={e.score} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Moves screen (Task 11 brief): patterns across several changes, each backed by its chain of live changes
 * (decision 10). Gated on the `dashboard` feature (decision 2) — agency roles always have it.
 */
export default async function MovesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const moveParam = parseMoveId(sp.move);
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const [profile, { items }, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId, status }),
    helpGuides(ctx, 'client', clientId),
  ]);
  const selectedId = moveParam ?? items[0]?.id ?? null;
  // A bookmarked `?move=` may be closed out of its events, removed or not this client's: the list still renders and
  // the panel says so (same text for every case — no existence leak). The page-level gates above still 404.
  const detail = !selectedId
    ? null
    : moveParam
      ? await tryCallTool<MoveDetail>(ctx, 'get_move', { clientId, moveId: selectedId })
      : await callTool<MoveDetail>(ctx, 'get_move', { clientId, moveId: selectedId });

  return (
    <>
      <PageHeader
        title="Moves"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Insights', 'Moves')}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      <div className="flex items-center gap-2">
        <div className="flex w-fit items-center gap-1 rounded-md bg-muted-surface p-1">
          <StatusLink clientId={clientId} status="open" current={status} label="Open" />
          <StatusLink clientId={clientId} status="closed" current={status} label="Closed" />
          <StatusLink clientId={clientId} status="all" current={status} label="All" />
        </div>
        <HelpTip tip="client.moves.statuses" />
      </div>

      <ListDetail
        selectedId={selectedId}
        sheetOpen={!!moveParam}
        closeHref={movesHref(clientId, { status })}
        listLabel="Moves"
        detailTitle="Move details"
        list={
        <Card>
          <CardContent className="p-2">
            {items.length === 0 ? (
              <EmptyState {...(status === 'open' ? COPY.empty.noOpen : COPY.empty.noMatch)} />
            ) : (
              <div className="flex flex-col gap-1">
                {items.map((m) => (
                  <MoveCard key={m.id} move={m} selected={m.id === selectedId} current={m.id === moveParam} href={movesHref(clientId, { status, move: m.id })} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        }
        detail={
          <div>
          {detail ? (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    {detail.label} · {detail.competitorName}
                  </h2>
                </div>
                <MoveStatusRow move={detail} timezone={profile.timezone} />
                {detail.facts.length > 0 && (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    {detail.facts.map((f) => (
                      <div key={f.label}>
                        <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <EvidenceChain clientId={clientId} move={detail} timezone={profile.timezone} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {selectedId ? 'This move is no longer available.' : <EmptyState {...COPY.empty.noSelection} />}
              </CardContent>
            </Card>
          )}
          </div>
        }
        empty={<EmptyState {...COPY.empty.noSelection} />}
      />
    </>
  );
}
