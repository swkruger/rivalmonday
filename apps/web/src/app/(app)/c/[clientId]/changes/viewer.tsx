/**
 * Evidence viewer panel (Task 9 brief). Server component — no hooks, no `'use client'` — so it freely imports
 * `@cs/tools` types and reads `EventDetail`/`CompareView` produced by Task 8's page. Tabs and the change selector
 * are plain links driven by `ChangesParams` (`changesHref`), matching the GET-driven filter pattern from `feed.tsx`.
 */
import type { CompareView, EventDetail, SnapshotSide } from '@cs/tools';
import { humanise } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { EvidenceImage } from '@/components/evidence-image';
import { submitFeedbackAction } from './actions';
import { DiffText } from './diff-text';
import { FeedbackButtons } from './feedback-buttons';
import { RoutePill } from './feed';
import { changesHref, type ChangesParams } from './params';

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatFullUtc(iso: string): string {
  return new Date(iso).toUTCString();
}

const TABS: { id: ChangesParams['tab']; label: string }[] = [
  { id: 'side', label: 'Side by side' },
  { id: 'text', label: 'Text changes' },
  { id: 'details', label: 'Capture details' },
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
        <div role="img" aria-label={value.toFixed(2)} className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Snapshot({ clientId, label, side, pageUrl }: { clientId: string; label: string; side: SnapshotSide | null; pageUrl: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">
        {label}
        {side ? ` · ${formatShortDate(side.capturedAt)}` : ''}
      </h3>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-line">
        {!side ? (
          <p className="p-4 text-sm text-muted-foreground">No capture recorded for this side.</p>
        ) : side.screenshot === null ? (
          <p className="p-4 text-sm text-muted-foreground">No snapshot was stored for this capture.</p>
        ) : (
          <>
            <EvidenceImage src={`/files/evidence/${clientId}/${side.screenshot.evidenceId}`} alt={`${label} snapshot of ${pageUrl ?? ''}`} loading="lazy" className="w-full" />
            {side.screenshot.fallback && (
              <p className="border-t border-line p-2 text-xs text-muted-foreground">
                Page unchanged at this capture — showing the snapshot from {formatShortDate(side.screenshot.capturedAt)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CaptureDetails({ clientId, label, side }: { clientId: string; label: string; side: SnapshotSide | null }) {
  const evidenceId = side?.screenshot?.evidenceId ?? side?.textEvidenceId ?? null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{label}</h3>
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Captured</dt>
          <dd>{side ? formatFullUtc(side.capturedAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Status</dt>
          <dd>{side?.status ?? '—'}</dd>
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
      <CardHeader>
        <CardTitle>Why this scored {detail.score}</CardTitle>
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
  canGiveFeedback,
}: {
  clientId: string;
  params: ChangesParams;
  detail: EventDetail;
  compare: CompareView | null;
  canGiveFeedback: boolean;
}) {
  const activeChange = detail.changes.find((c) => c.changeId === params.change) ?? detail.changes[0];
  const hasCaptures = !!compare?.before && !!compare?.after;

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
                    ? ` · changed between ${formatShortDate(compare!.before!.capturedAt)} and ${formatShortDate(compare!.after!.capturedAt)}`
                    : ` · detected ${formatShortDate(activeChange.detectedAt)}`}
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
          <div role="tablist" className="flex w-fit gap-1 rounded-lg bg-muted-surface p-1">
            {TABS.map((t) => {
              const active = params.tab === t.id;
              return (
                <Link
                  key={t.id}
                  role="tab"
                  aria-selected={active ? 'true' : 'false'}
                  href={changesHref(clientId, { ...params, tab: t.id })}
                  className={
                    active
                      ? 'rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-ink shadow-card'
                      : 'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-ink'
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          <Card>
            <CardContent>
              {params.tab === 'side' &&
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
                    <Snapshot clientId={clientId} label="Before" side={compare.before} pageUrl={compare.pageUrl} />
                    <Snapshot clientId={clientId} label="After" side={compare.after} pageUrl={compare.pageUrl} />
                  </div>
                ))}

              {params.tab === 'text' && (
                <div className="flex flex-col gap-3">
                  {compare.facts.length > 0 && (
                    <span className="inline-flex w-fit items-center rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {compare.facts.length} number change{compare.facts.length === 1 ? '' : 's'}
                    </span>
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

              {params.tab === 'details' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <CaptureDetails clientId={clientId} label="Before" side={compare.before} />
                  <CaptureDetails clientId={clientId} label="After" side={compare.after} />
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
                    {m.label} · {m.status}
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
