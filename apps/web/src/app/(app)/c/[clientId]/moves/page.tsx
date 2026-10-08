import { hasFeature } from '@cs/core';
import type { MoveDetail, MoveRow } from '@cs/tools';
import { Card, CardContent } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { changesHref } from '../changes/params';
import { RoutePill } from '../changes/feed';
import { MoveCard, movesHref } from './move-card';

export const dynamic = 'force-dynamic';

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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function StatusLink({ clientId, status, current, label }: { clientId: string; status: Status; current: Status; label: string }) {
  const active = status === current;
  return (
    <Link
      href={movesHref(clientId, { status })}
      aria-current={active ? 'page' : undefined}
      className={active ? 'rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-ink shadow-card' : 'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-ink'}
    >
      {label}
    </Link>
  );
}

function MoveStatusRow({ move }: { move: MoveDetail }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>First detected {formatShortDate(move.firstDetectedAt)}</span>
        {move.lastEvidenceAt && <span>Latest evidence {formatShortDate(move.lastEvidenceAt)}</span>}
        {move.closedAt && <span>Closed {formatShortDate(move.closedAt)}</span>}
        <span>Confidence {Math.round(move.confidence * 100)}%</span>
      </div>
      <p className="text-xs text-muted-foreground">Confidence grows with each extra supporting change and each extra channel.</p>
    </div>
  );
}

function EvidenceChain({ clientId, move }: { clientId: string; move: MoveDetail }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Evidence chain</h3>
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
                <p className="mt-0.5 text-xs text-muted-foreground">{formatShortDate(e.occurredAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`font-extrabold ${e.route === 'archive' ? 'text-muted-foreground' : 'text-secondary'}`}>{e.score}</span>
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

  const { items } = await callTool<{ items: MoveRow[] }>(ctx, 'list_moves', { clientId, status });
  const selectedId = moveParam ?? items[0]?.id;
  const detail = selectedId ? await callTool<MoveDetail>(ctx, 'get_move', { clientId, moveId: selectedId }) : null;

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Moves</h1>
        <p className="mt-1 text-muted-foreground">
          Patterns across several changes — a competitor expanding, cutting prices or pushing ads. Each one is backed by the changes listed.
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-muted-surface p-1 w-fit">
        <StatusLink clientId={clientId} status="open" current={status} label="Open" />
        <StatusLink clientId={clientId} status="closed" current={status} label="Closed" />
        <StatusLink clientId={clientId} status="all" current={status} label="All" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardContent className="p-2">
            {items.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No moves detected in this period.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {items.map((m) => (
                  <MoveCard key={m.id} move={m} selected={m.id === selectedId} href={movesHref(clientId, { status, move: m.id })} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          {detail ? (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    {detail.label} · {detail.competitorName}
                  </h2>
                </div>
                <MoveStatusRow move={detail} />
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
                <EvidenceChain clientId={clientId} move={detail} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">Select a move on the left to see its evidence chain.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
