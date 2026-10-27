/**
 * Evidence viewer panel (Task 9 brief). Server component — no hooks, no `'use client'` — so it freely imports
 * `@cs/tools` types and reads `EventDetail`/`CompareView` produced by Task 8's page. Tabs and the change selector
 * are plain links driven by `ChangesParams` (`changesHref`), matching the GET-driven filter pattern from `feed.tsx`.
 */
import type { CaptureCompareView, CompareView, EventDetail, SnapshotSide } from '@cs/tools';
import { humanise } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, StatusChip, TabsLink, TabsLinkList } from '@cs/ui';
import Link from 'next/link';
import { EvidenceImage } from '@/components/evidence-image';
import { WholePageDiff } from '@/components/whole-page-diff';
import { HelpTip } from '@/components/help/help-tip';
import { submitFeedbackAction } from './actions';
import { DiffText } from './diff-text';
import { formatDate, formatDateTime } from '@/lib/format';
import { CAPTURE_STATUS, labelFor, MOVE_STATUS } from '@/lib/labels';
import { FeedbackButtons } from './feedback-buttons';
import { RoutePill } from './feed';
import { changesHref, effectiveTab, type ChangesParams } from './params';

const TABS: { id: ChangesParams['tab']; label: string }[] = [
  { id: 'side', label: 'Side by side' },
  { id: 'text', label: 'Text changes' },
  { id: 'details', label: 'Capture details' },
  { id: 'page', label: 'Whole page' },
];

function FactorBar({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-muted-surface-2">
        <div role="img" aria-label={`${label} ${value.toFixed(2)}`} className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Snapshot({ clientId, label, side, pageUrl, timezone }: { clientId: string; label: string; side: SnapshotSide | null; pageUrl: string | null; timezone: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">
        {label}
        {side ? ` · ${formatDate(side.capturedAt, { tz: timezone })}` : ''}
      </h3>
      <div className="max-h-[560px] overflow-auto">
        {!side ? (
          <p className="p-4 text-sm text-muted-foreground">No capture recorded for this side.</p>
        ) : side.screenshot === null ? (
          <p className="p-4 text-sm text-muted-foreground">No snapshot was stored for this capture.</p>
        ) : (
          <>
            <EvidenceImage src={`/files/evidence/${clientId}/${side.screenshot.evidenceId}`} alt={`${label} snapshot of ${pageUrl ?? ''}`} loading="lazy" className="w-full" />
            {side.screenshot.fallback && (
              <p className="border-t border-line p-2 text-xs text-muted-foreground">
                Page unchanged at this capture — showing the snapshot from {formatDate(side.screenshot.capturedAt, { tz: timezone })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CaptureDetails({ clientId, label, side, timezone }: { clientId: string; label: string; side: SnapshotSide | null; timezone: string }) {
  const evidenceId = side?.screenshot?.evidenceId ?? side?.textEvidenceId ?? null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{label}</h3>
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Captured</dt>
          <dd>{side ? formatDateTime(side.capturedAt, { tz: timezone, zoneLabel: true }) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
          <dd>
            {side ? (
              <StatusChip tone={labelFor(CAPTURE_STATUS, side.status).tone}>{labelFor(CAPTURE_STATUS, side.status).label}</StatusChip>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">SHA-256</dt>
          <dd className="font-mono break-all">{side?.hash ?? '—'}</dd>
        </div>
      </dl>
      {evidenceId && (
        <Link href={`/c/${clientId}/evidence/${evidenceId}`} className="font-semibold text-primary-soft-text">
          Open evidence
        </Link>
      )}
    </div>
  );
}

function ScorePanel({ detail }: { detail: EventDetail }) {
  const f = detail.factors;
  return (
    <Card>
      <CardHeader className="flex items-center gap-1.5">
        <CardTitle>Why this scored {detail.score}</CardTitle>
        <HelpTip tip="client.changes.score" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FactorBar label="Type" value={f.typeWeight} />
        <FactorBar label="Size" value={f.size} />
        <FactorBar label="Relevance" value={f.relevance} sub={`service ${f.serviceOverlap.toFixed(2)} × area ${f.territoryOverlap.toFixed(2)}`} />
        <FactorBar label="Novelty" value={f.novelty} />
        <p className="text-sm text-muted-foreground">
          Alerts from {f.thresholds.alert}, weekly brief from {f.thresholds.brief}.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * `detail.changes` is empty when every detected change behind this event was superseded after scoring (Review
 * Focus 3) — there is then nothing for `compare_snapshots` to show, so `compare` is `null` and the panel is
 * limited to the header and the score breakdown, per the brief.
 */
export function EventViewer({
  clientId,
  params,
  detail,
  compare,
  wholePage = null,
  canGiveFeedback,
  timezone,
}: {
  clientId: string;
  params: ChangesParams;
  detail: EventDetail;
  compare: CompareView | null;
  /** `compare_captures` output, loaded by the page only while the Whole page tab is active. */
  wholePage?: CaptureCompareView | null;
  canGiveFeedback: boolean;
  timezone: string;
}) {
  const activeChange = detail.changes.find((c) => c.changeId === params.change) ?? detail.changes[0];
  const hasCaptures = !!compare?.before && !!compare?.after;
  const tab = effectiveTab(params.tab, compare);
  const tabs = TABS.filter((t) => t.id !== 'page' || (compare?.channel === 'web' && !!compare.after));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink">{detail.summary}</h2>
              {activeChange && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeChange.pageUrl ?? activeChange.channelLabel}
                  {hasCaptures
                    ? ` · changed between ${formatDate(compare!.before!.capturedAt, { tz: timezone })} and ${formatDate(compare!.after!.capturedAt, { tz: timezone })}`
                    : ` · detected ${formatDate(activeChange.detectedAt, { tz: timezone })}`}
                  {detail.changes.length > 1 ? ` · also seen in ${detail.changes.length - 1} other places` : ''}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-lg font-extrabold ${detail.route === 'archive' ? 'text-muted-foreground' : 'text-secondary'}`}>{detail.score}</span>
              <RoutePill route={detail.route} score={detail.score} />
            </div>
          </div>

          {detail.changes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {detail.changes.map((c, i) => {
                const active = c.changeId === activeChange?.changeId;
                return (
                  <Link
                    key={c.changeId}
                    href={changesHref(clientId, { ...params, change: c.changeId })}
                    aria-current={active ? 'true' : undefined}
                    className={
                      active
                        ? 'rounded-md bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary-soft-text'
                        : 'rounded-md bg-muted-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-ink'
                    }
                  >
                    Evidence {i + 1} · {c.channelLabel}
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!compare ? (
        <>
          <ScorePanel detail={detail} />
          <p className="text-muted-foreground">The evidence for this change was withdrawn.</p>
        </>
      ) : (
        <>
          <TabsLinkList aria-label="Evidence views" className="max-w-full self-start overflow-x-auto">
            {tabs.map((t) => (
              <TabsLink key={t.id} asChild active={t.id === tab} className="flex-none px-3">
                <Link href={changesHref(clientId, { ...params, tab: t.id })}>{t.label}</Link>
              </TabsLink>
            ))}
          </TabsLinkList>

          <Card>
            <CardContent>
              {tab === 'side' &&
                (compare.before === null && compare.after === null ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">This change comes from {compare.channelLabel}; there is no page snapshot.</p>
                    {compare.details.length > 0 && (
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                        {compare.details.map((d) => (
                          <div key={d.label}>
                            <dt className="text-xs font-medium text-muted-foreground">{d.label}</dt>
                            <dd>{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Snapshot clientId={clientId} label="Before" side={compare.before} pageUrl={compare.pageUrl} timezone={timezone} />
                    <Snapshot clientId={clientId} label="After" side={compare.after} pageUrl={compare.pageUrl} timezone={timezone} />
                  </div>
                ))}

              {tab === 'text' && (
                <div className="flex flex-col gap-3">
                  {compare.facts.length > 0 && (
                    <StatusChip tone="neutral" className="w-fit">
                      {compare.facts.length} number change{compare.facts.length === 1 ? '' : 's'}
                    </StatusChip>
                  )}
                  <DiffText segments={compare.diff} />
                  {compare.facts.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {compare.facts.map((f, i) => (
                        <li key={i}>
                          <span className="font-medium text-ink">{humanise(f.kind)}:</span> {f.before ?? '—'} → {f.after ?? '—'}
                          {f.pct !== null ? ` (${f.pct}%)` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'page' && wholePage && <WholePageDiff view={wholePage} timezone={timezone} />}

              {tab === 'details' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <CaptureDetails clientId={clientId} label="Before" side={compare.before} timezone={timezone} />
                  <CaptureDetails clientId={clientId} label="After" side={compare.after} timezone={timezone} />
                </div>
              )}
            </CardContent>
          </Card>

          <ScorePanel detail={detail} />

          {detail.moves.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">Part of moves</h3>
              <div className="flex flex-wrap gap-2">
                {detail.moves.map((m) => (
                  <Link
                    key={m.id}
                    href={`/c/${clientId}/moves?status=all&move=${m.id}`}
                    className="rounded-md bg-muted-surface-2 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-ink"
                  >
                    {m.label} · {labelFor(MOVE_STATUS, m.status).label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {canGiveFeedback && <FeedbackButtons clientId={clientId} eventId={detail.eventId} current={detail.myFeedback} action={submitFeedbackAction} />}
        </>
      )}
    </div>
  );
}
