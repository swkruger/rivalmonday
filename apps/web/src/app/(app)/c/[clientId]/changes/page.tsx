import { hasFeature, hasPermission } from '@cs/core';
import { changeTypeOptions, channelLabel, type ClientProfile, type CompareView, type EventDetail, type EventRow, type TrackedCompetitor } from '@cs/tools';
import { Card, CardContent } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { FeedList, FilterBar } from './feed';
import { groupByWeek } from './group';
import { changesHref, parseChangesParams } from './params';
import { EventViewer } from './viewer';

export const dynamic = 'force-dynamic';

function EmptyViewer({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

/**
 * Changes feed (Task 8 brief): GET-form filters over `search_events`, grouped by week, with a viewer slot on the
 * right that Task 9 fills in. Gated on the `dashboard` feature (decision 2) — agency roles always have it.
 */
export default async function ChangesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const p = parseChangesParams(await searchParams);
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();

  const types = changeTypeOptions();
  // A `type` value that search_events wouldn't recognise would surface as `invalid_input` (→ 404) — pass it along
  // only when it's one of the real change types (brief: "avoid that").
  const changeType = p.type && types.some((t) => t.id === p.type) ? p.type : undefined;

  const [profile, feed, tracked] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: EventRow[]; hasMore: boolean }>(ctx, 'search_events', {
      clientId,
      competitorId: p.competitor,
      changeType,
      serviceId: p.service,
      route: p.route,
      days: p.days,
      query: p.q,
      offset: p.offset,
      limit: 50,
    }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
  ]);
  const services = (await verticalOptions()).find((v) => v.id === profile.verticalId)?.services.filter((s) => profile.services.includes(s.id)) ?? [];
  const rows = feed.items.map((r) => ({ ...r, channels: r.channels.map(channelLabel) }));
  const selectedId = p.event ?? rows[0]?.eventId;
  const groups = groupByWeek(rows, new Date());

  let detail: EventDetail | null = null;
  let compare: CompareView | null = null;
  if (selectedId) {
    // A bookmarked `?event=` may be retracted, removed or not this client's: the feed still renders and the viewer
    // says so (same text for every case — no existence leak). The page-level gates above still 404.
    detail = p.event
      ? await tryCallTool<EventDetail>(ctx, 'get_event', { clientId, eventId: selectedId })
      : await callTool<EventDetail>(ctx, 'get_event', { clientId, eventId: selectedId });
  }
  if (detail) {
    const changeId = p.change && detail.changes.some((c) => c.changeId === p.change) ? p.change : detail.changes[0]?.changeId;
    compare = changeId ? await callTool<CompareView>(ctx, 'compare_snapshots', { clientId, changeId }) : null;
  }

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Changes</h1>
        <p className="mt-1 text-muted-foreground">Everything your competitors changed, scored for how much it matters to you. Every item links to proof.</p>
      </div>

      <FilterBar
        clientId={clientId}
        params={p}
        competitors={tracked.items.map((c) => ({ id: c.id, name: c.name }))}
        types={types}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
      />

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                <p>No changes match these filters.</p>
                {p.route === 'flagged' && (
                  <Link href={changesHref(clientId, { ...p, route: 'all' })} className="font-semibold text-primary-soft-text">
                    Show all changes, including archived
                  </Link>
                )}
              </div>
            ) : (
              <>
                <FeedList clientId={clientId} params={p} groups={groups} selectedId={selectedId} />
                {feed.hasMore && (
                  <div className="border-t border-line p-3 text-center">
                    <Link href={changesHref(clientId, { ...p, offset: p.offset + 50, event: undefined })} className="font-semibold text-primary-soft-text">
                      Show older changes
                    </Link>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div>
          {detail ? (
            <EventViewer
              clientId={clientId}
              params={p}
              detail={detail}
              compare={compare}
              canGiveFeedback={hasPermission(ctx, 'feedback') && !ctx.userId.startsWith('contact:')}
            />
          ) : (
            <EmptyViewer message={selectedId ? 'This change is no longer available.' : 'Select a change on the left to see the evidence behind it.'} />
          )}
        </div>
      </div>
    </>
  );
}
