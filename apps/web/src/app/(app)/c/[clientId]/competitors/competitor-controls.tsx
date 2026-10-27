'use client';
import type { CompetitorSignalView, HiddenReason, SuggestionView, Tier, TrackedCompetitor } from '@cs/tools';
import { BulkBar, bulkBarActionClass, Button, Card, ConfirmDialog, Field, Input, Section, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TierMark } from '@cs/ui';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useActionState, useEffect, useId, useState, useTransition } from 'react';
import { HelpEmpty } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { useReadOnly } from '@/components/read-only';
import { SignalPills } from '@/components/rival/signal-pills';
import { ratedLabel } from '@/components/rival/rated-label';
import { TierChip } from '@/components/rival/tier-chip';
import type { FormResult } from '@/server/forms';
import { acceptSuggestionsAction, addCompetitorAction, dismissSuggestionAction, removeCompetitorAction, requestSuggestionsAction, type SearchState, type SearchStatus, searchStatusAction } from './actions';
import { ErrorNote } from '@/components/form-error';
import { formatDate, kmToMiles } from '@/lib/format';

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <ErrorNote focusKey={state}>
        {state.error}
      </ErrorNote>
    );
  }
  if (state.ok && state.message) {
    return <p className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>;
  }
  return null;
}

/** The last row-level result, tagged with the row it was for so a refusal shows in its own dialog. */
type RowResult = FormResult & { rowId?: string };
type RowAction = (fd: FormData) => void;

/**
 * Final-review fix: dismiss state lives in `SuggestionsPanel` (and remove state in `TrackedCompetitorsTable`),
 * which stay mounted. Each action revalidates the page on success, which removes the suggestion row (or the tracked
 * competitor row and its dialog) in the same update; state held in the row would vanish before its message painted.
 */
async function dismissAction(prev: RowResult, fd: FormData): Promise<RowResult> {
  const r = await dismissSuggestionAction(prev, fd);
  return { ...r, rowId: String(fd.get('suggestionId') ?? '') };
}

async function removeAction(prev: RowResult, fd: FormData): Promise<RowResult> {
  const r = await removeCompetitorAction(prev, fd);
  return { ...r, rowId: String(fd.get('competitorId') ?? '') };
}

function DismissSuggestionForm({ clientId, suggestion, action, pending }: { clientId: string; suggestion: SuggestionView; action: RowAction; pending: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={`Dismiss ${suggestion.name}`}>
        Dismiss
      </Button>
    </form>
  );
}

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 10_000;
const FAST_FOR_MS = 60_000;
const GIVE_UP_MS = 60 * 60_000;

type Progress = 'searching' | 'done' | 'failed' | 'gave_up' | null;

/**
 * Follows the background competitor search: every 5 s for the first minute, then every 10 s, for up to 60 minutes
 * (a full search runs hundreds of paid map lookups and usually takes 20–40 minutes). When it finishes the page data is re-fetched so the new
 * suggestions appear without a reload. A search already running when the page loads is picked up the same way.
 */
function useSearchProgress(clientId: string, initialSearch: SearchState, request: FormResult, enabled = true): { progress: Progress; status: SearchStatus | null; failedOnLoad: boolean } {
  // Destructured so a re-render (status updates) does not restart the poll timer.
  const { refresh } = useRouter();
  const [progress, setProgress] = useState<Progress>(
    !enabled ? null : initialSearch === 'queued' || initialSearch === 'running' ? 'searching' : initialSearch === 'failed' ? 'failed' : null,
  );
  const [status, setStatus] = useState<SearchStatus | null>(null);
  // A failed search already stored when the page loaded is shown passively (no focus); a later failure is new.
  const [failedOnLoad, setFailedOnLoad] = useState(enabled && initialSearch === 'failed');

  // Each accepted "Find competitors" request is a new result object, so this starts (or restarts) the watch.
  useEffect(() => {
    if (enabled && request.ok && request.message) {
      setProgress('searching');
      setFailedOnLoad(false);
    }
  }, [request, enabled]);

  useEffect(() => {
    if (!enabled || progress !== 'searching') return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      const elapsed = Date.now() - started;
      if (elapsed >= GIVE_UP_MS) {
        setProgress('gave_up');
        return;
      }
      timer = setTimeout(check, elapsed < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
    };
    const check = async () => {
      const r = await searchStatusAction(clientId).catch(() => null);
      if (stopped) return;
      if (r?.ok) setStatus(r.data);
      // `idle` means the job is gone from the queue (archived), which only happens after it finished.
      if (r?.ok && (r.data.state === 'done' || r.data.state === 'idle')) {
        setProgress('done');
        refresh();
      } else if (r?.ok && r.data.state === 'failed') {
        setProgress('failed');
      } else {
        schedule();
      }
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [progress, clientId, refresh, enabled]);

  return { progress, status, failedOnLoad };
}

function SearchProgress({ progress, status, found, failedOnLoad = false }: { progress: Progress; status: SearchStatus | null; found: number; failedOnLoad?: boolean }) {
  if (progress === 'searching') {
    const checking = status?.stage === 'checking' || status?.stage === 'finalising';
    return (
      <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">
        {checking
          ? `Checking ads and reviews for ${status.checksTotal} businesses…`
          : status && status.searchesTotal > 0
            ? `Searching your area… ${status.searchesDone} of ${status.searchesTotal} searches`
            : 'Searching your area…'}
      </p>
    );
  }
  if (progress === 'done') {
    return (
      <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">
        {found > 0 ? `Search finished — ${found} suggestion${found === 1 ? '' : 's'} below.` : 'Search finished — no new businesses found.'}
      </p>
    );
  }
  if (progress === 'failed') {
    return (
      <ErrorNote passive={failedOnLoad}>
        The search didn&apos;t finish. Your earlier suggestions are still here. Try again later.
      </ErrorNote>
    );
  }
  if (progress === 'gave_up') {
    return <p className="rounded-md bg-muted-surface p-3 text-ink">Still searching — check back in a few minutes.</p>;
  }
  return null;
}

const HIDDEN_LABEL: Record<HiddenReason, string> = {
  wrong_category: 'Different kind of business',
  outside_area: 'Outside your service area',
  self: 'This is your business',
  closed: 'Permanently closed',
  thin: 'Too little information',
};
const TIER_ORDER: Tier[] = ['top', 'watch', 'minor'];
/** Suggestion group headings carry a TierMark; only Top rival carries a hint. */
const TIER_HINT: Partial<Record<Tier, string>> = { top: 'close by, same services, active' };
const TIER_RANK: Record<Tier, number> = { top: 0, watch: 1, minor: 2 };

const initialSelection = (list: SuggestionView[]) => new Set(list.filter((s) => s.preselected).map((s) => s.id));

/** Any vendor-checked signal that came back null (never read as zero) gets this note on the card. */
const hasUnchecked = (s: SuggestionView['signals']) => s.reviews30d === null || s.googleAdsActive === null || s.metaPage === null;

function SuggestionCard({ suggestion: s, selectable, checked, checkDisabled, onToggle, dismiss }: {
  suggestion: SuggestionView;
  selectable: boolean;
  checked: boolean;
  checkDisabled: boolean;
  onToggle: () => void;
  dismiss: React.ReactNode;
}) {
  const meta = [s.category, s.distanceKm !== null ? `${kmToMiles(s.distanceKm).toFixed(1)} mi` : null, s.domain].filter(Boolean).join(' · ');
  const checkboxId = useId();
  // Only a card whose checkbox can be ticked looks clickable; the name block is that checkbox's label.
  const clickable = selectable && !checkDisabled;
  const nameBlock = (
    <>
      <span className="block font-semibold">{s.name}</span>
      {meta && <span className="block text-13 text-muted-ink">{meta}</span>}
    </>
  );
  return (
    <li>
    <Card variant={clickable ? 'interactive' : 'default'} selected={checked} className="flex items-start gap-3 p-4">
      {selectable && <input id={checkboxId} type="checkbox" className="mt-1.5 size-4 accent-secondary" aria-label={`Track ${s.name}`} checked={checked} disabled={checkDisabled} onChange={onToggle} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {selectable ? (
          <label htmlFor={checkboxId} className={`flex min-w-0 flex-col gap-2 ${clickable ? 'cursor-pointer' : ''}`}>
            {nameBlock}
          </label>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">{nameBlock}</div>
        )}
        <SignalPills signals={s.signals} mode="suggestion" />
        {hasUnchecked(s.signals) && <p className="text-xs text-muted-ink">Some signals unavailable</p>}
      </div>
      {dismiss}
    </Card>
    </li>
  );
}

export function SuggestionsPanel({
  clientId,
  ready,
  suggestions,
  atLimit,
  /**
   * Review Fix 2: the caller (`page.tsx`, a server file) passes the client's real `competitorLimit`
   * (from `list_client_competitors`'s `limit`, 5b-2 decision 6) so the "at limit" copy never hardcodes the
   * number. This component is `'use client'` and must not import a runtime value from `@cs/tools` itself
   * (common.md: don't pull server-only packages into client components — pass data as props), so the default
   * here only covers the brief's fixed test call, which omits the prop.
   */
  limit = 5,
  trackedCount = 0,
  initialSearch = 'idle',
  canSearch,
  hiddenList = [],
  nextSearchLabel = null,
}: {
  clientId: string;
  /** Keywords, a service area and a Google Place ID are all present. */
  ready: boolean;
  suggestions: SuggestionView[];
  atLimit: boolean;
  limit?: number;
  /** Competitors already tracked, so "Track selected" never offers more than the room left under the limit. */
  trackedCount?: number;
  /** The latest search's state when the page rendered, so a search still running after a reload keeps being followed. */
  initialSearch?: SearchState;
  /** Paid search is agency-only; client owners only review suggestions. */
  canSearch: boolean;
  /** What the latest search left out, with the decided reason label. */
  hiddenList?: { name: string; reason: HiddenReason }[];
  /** One manual search per client-local week: the next allowed day ("Mon 20 Oct"), or null when one is allowed now. */
  nextSearchLabel?: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestSuggestionsAction, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const { progress, status, failedOnLoad } = useSearchProgress(clientId, initialSearch, state, canSearch && !readOnly);
  const searching = progress === 'searching';
  const [rowState, rowAction, rowPending] = useActionState(dismissAction, { ok: true } as RowResult);

  // Top rivals start ticked (up to the room left); a refreshed list starts from its own pre-ticks again.
  const [selected, setSelected] = useState(() => initialSelection(suggestions));
  const idsKey = suggestions.map((s) => s.id).join(',');
  const [seenKey, setSeenKey] = useState(idsKey);
  if (seenKey !== idsKey) {
    // Keep the user's ticks for ids that survive a refresh or dismiss; only ids new to the list get their pre-tick.
    const before = new Set(seenKey ? seenKey.split(',') : []);
    const next = new Set<string>();
    for (const s of suggestions) if (before.has(s.id) ? selected.has(s.id) : s.preselected) next.add(s.id);
    setSeenKey(idsKey);
    setSelected(next);
  }
  const [bulkState, setBulkState] = useState<FormResult>({ ok: true });
  const [tracking, startTracking] = useTransition();
  const room = atLimit ? 0 : Math.max(0, limit - trackedCount);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const track = () =>
    startTracking(async () => {
      setBulkState(await acceptSuggestionsAction(clientId, [...selected]));
    });

  const groups = TIER_ORDER.map((t) => ({ tier: t, items: suggestions.filter((s) => (s.tier ?? 'minor') === t) })).filter((g) => g.items.length > 0);
  return (
    <Section title="Suggested competitors" titleAside={<HelpTip tip="client.competitors.suggestions" />} className="gap-5">
        {canSearch && !readOnly && !ready && (
          <p className="text-muted-ink">
            Add keywords and a service area to search.{' '}
            <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">
              Go to Business profile
            </Link>
          </p>
        )}
        {readOnly ? null : canSearch ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Button type="submit" disabled={!ready || pending || searching || nextSearchLabel !== null} className="self-start">
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Searching…
                </>
              ) : nextSearchLabel !== null ? (
                `Next search available ${nextSearchLabel}`
              ) : (
                'Find competitors'
              )}
            </Button>
            <p className="text-sm text-muted-ink">A full search runs hundreds of map lookups and usually takes 20–40 minutes. You can leave this page.</p>
            {!state.ok && <Message state={state} />}
            <SearchProgress progress={progress} status={status} found={suggestions.length} failedOnLoad={failedOnLoad} />
          </form>
        ) : (
          <p className="text-sm text-muted-ink"><HelpText text="{agency} can look for more competitors for you." /></p>
        )}
        <Message state={rowState} />
        <Message state={bulkState} />
        {suggestions.length === 0 && !searching && <p className="text-muted-ink">No competitors found yet. Add keywords and a service area, then search.</p>}
        {groups.map((g) => (
          <section key={g.tier} className="flex flex-col gap-3" aria-labelledby={`tier-${g.tier}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`tier-${g.tier}`} className="text-sm font-semibold text-ink">
                <TierMark tier={g.tier} /> <span className="text-xs font-medium text-muted-ink">· {g.items.length}</span>
              </h3>
              {TIER_HINT[g.tier] && <span className="text-xs text-muted-ink">{TIER_HINT[g.tier]}</span>}
            </div>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
              {g.items.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    selectable={!readOnly}
                    checked={checked}
                    checkDisabled={!checked && selected.size >= room}
                    onToggle={() => toggle(s.id)}
                    dismiss={readOnly ? null : <DismissSuggestionForm clientId={clientId} suggestion={s} action={rowAction} pending={rowPending} />}
                  />
                );
              })}
            </ul>
          </section>
        ))}
        {suggestions.length > 0 && !readOnly && (
          <BulkBar label="Selected suggestions">
            <Button
              type="button"
              onClick={track}
              disabled={selected.size === 0 || selected.size > room || tracking}
              title={room === 0 ? `This client already tracks ${limit} competitors` : undefined}
              className={bulkBarActionClass}
            >
              Track selected ({selected.size})
            </Button>
            {room === 0 && <span role="status" className="text-13 text-white/80">This client already tracks {limit} competitors</span>}
            {room > 0 && selected.size >= room && <span role="status" className="text-13 text-white/80">You can track {room} more.</span>}
          </BulkBar>
        )}
        {hiddenList.length > 0 && (
          <details className="pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Show {hiddenList.length} hidden</summary>
            <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
              {hiddenList.map((h, i) => (
                <li key={`${h.name}-${i}`} className="flex flex-wrap justify-between gap-2">
                  <span>{h.name}</span>
                  <span className="text-muted-ink">{HIDDEN_LABEL[h.reason]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
    </Section>
  );
}

export function AddCompetitorForm({ clientId, atLimit, limit }: { clientId: string; atLimit: boolean; limit: number }) {
  const [state, formAction, pending] = useActionState(addCompetitorAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <Message state={state} />
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Name">
          <Input id="competitor-name" name="name" required className="w-48" />
        </Field>
        <Field label="Website">
          <Input id="competitor-domain" name="domain" placeholder="smithhvac.com" className="w-56" />
        </Field>
        <Field label="Google Place ID (optional)">
          <Input id="competitor-place-id" name="placeId" className="w-56" />
        </Field>
        <Button type="submit" disabled={atLimit || pending} title={atLimit ? `This client already tracks ${limit} competitors` : undefined}>
          Add competitor
        </Button>
      </div>
    </form>
  );
}

function RemoveCompetitorButton({ clientId, competitorId, name, action, onOpen }: { clientId: string; competitorId: string; name: string; action: (fd: FormData) => Promise<void>; onOpen: () => void }) {
  return (
    <ConfirmDialog
      trigger={<Button type="button" variant="outline" size="sm" onClick={onOpen}>Remove</Button>}
      title={`Stop tracking ${name}?`}
      body="Its history is kept, and collection stops if no other client tracks it."
      confirmLabel="Stop tracking"
      tone="danger"
      fields={{ clientId, competitorId }}
      action={action}
    />
  );
}

/** The tracked-competitors table; a successful removal's message shows above it, a refusal under its own row. */
export function TrackedCompetitorsTable({ clientId, items, canRemove: canRemoveProp, signals = [], timezone }: { clientId: string; items: TrackedCompetitor[]; canRemove: boolean; signals?: CompetitorSignalView[]; timezone: string }) {
  const byCompetitor = new Map(signals.map((x) => [x.competitorId, x]));
  // Flat list: Top rival → Worth watching → Minor → not rated, then by name.
  const rank = (id: string) => {
    const t = byCompetitor.get(id)?.tier;
    return t ? TIER_RANK[t] : 3;
  };
  const ordered = [...items].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'en-US'));
  const canRemove = canRemoveProp && !useReadOnly();
  const [result, setResult] = useState<RowResult>({ ok: true });
  const [pending, setPending] = useState(false);
  const action = async (fd: FormData) => {
    setPending(true);
    try {
      setResult(await removeAction(result, fd));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {result.ok && <Message state={result} />}
      {items.length === 0 ? (
        canRemove ? (
          <>
            <HelpEmpty id="client.competitors.noTrackedAgency" />
            <HelpEmpty id="client.competitors.noTrackedManage" />
          </>
        ) : (
          <>
            <HelpEmpty id="client.competitors.noTrackedReadOnly" />
            <HelpEmpty id="client.competitors.noTrackedView" />
          </>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">
                  Name
                  <HelpTip tip="client.competitors.rated" />
                </span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">
                  Signals
                  <HelpTip term="signal" />
                </span>
              </TableHead>
              <TableHead>Website</TableHead>
              <TableHead numeric>Pages monitored</TableHead>
              <TableHead>Since</TableHead>
              {canRemove && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((c) => {
              const rated = byCompetitor.get(c.id);
              return (
              <Fragment key={c.id}>
              <TableRow>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/c/${clientId}/competitors/${c.id}`} className="font-semibold text-primary-soft-text">
                      {c.name}
                    </Link>
                    {rated && <TierChip tier={rated.tier} />}
                  </div>
                  <p className="mt-0.5 text-11 text-muted-ink">{rated ? ratedLabel(rated.computedAt, timezone) : 'Not rated yet'}</p>
                </TableCell>
                <TableCell>{rated ? <SignalPills signals={rated.signals} mode="tracked" /> : '—'}</TableCell>
                <TableCell>{c.domain ?? '—'}</TableCell>
                <TableCell numeric>{c.activePages}</TableCell>
                <TableCell>{formatDate(c.addedAt, { tz: timezone })}</TableCell>
                {canRemove && (
                  <TableCell>
                    <RemoveCompetitorButton clientId={clientId} competitorId={c.id} name={c.name} action={action} onOpen={() => setResult({ ok: true })} />
                  </TableCell>
                )}
              </TableRow>
              {!result.ok && result.rowId === c.id && (
                <TableRow>
                  <TableCell colSpan={canRemove ? 6 : 5}>
                    <Message state={result} />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
