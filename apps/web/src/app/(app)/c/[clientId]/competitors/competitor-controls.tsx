'use client';
import type { CompetitorSignalView, HiddenReason, SuggestionView, Tier, TrackedCompetitor } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useReadOnly } from '@/components/read-only';
import { SignalPills } from '@/components/rival/signal-pills';
import { ratedLabel } from '@/components/rival/rated-label';
import { TIER_LABEL, TierChip } from '@/components/rival/tier-chip';
import type { FormResult } from '@/server/forms';
import { acceptSuggestionsAction, addCompetitorAction, dismissSuggestionAction, removeCompetitorAction, requestSuggestionsAction, type SearchState, type SearchStatus, searchStatusAction } from './actions';

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>;
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
const GIVE_UP_MS = 10 * 60_000;

type Progress = 'searching' | 'done' | 'failed' | 'gave_up' | null;

/**
 * Follows the background competitor search: every 5 s for the first minute, then every 10 s, for up to 10 minutes
 * (a search is 18 paid map lookups, usually 1–4 minutes). When it finishes the page data is re-fetched so the new
 * suggestions appear without a reload. A search already running when the page loads is picked up the same way.
 */
function useSearchProgress(clientId: string, initialSearch: SearchState, request: FormResult, enabled = true): { progress: Progress; status: SearchStatus | null } {
  // Destructured so a re-render (status updates) does not restart the poll timer.
  const { refresh } = useRouter();
  const [progress, setProgress] = useState<Progress>(
    !enabled ? null : initialSearch === 'queued' || initialSearch === 'running' ? 'searching' : initialSearch === 'failed' ? 'failed' : null,
  );
  const [status, setStatus] = useState<SearchStatus | null>(null);

  // Each accepted "Find competitors" request is a new result object, so this starts (or restarts) the watch.
  useEffect(() => {
    if (enabled && request.ok && request.message) setProgress('searching');
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

  return { progress, status };
}

function SearchProgress({ progress, status, found }: { progress: Progress; status: SearchStatus | null; found: number }) {
  if (progress === 'searching') {
    const checking = status?.stage === 'checking' || status?.stage === 'finalising';
    return (
      <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
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
      <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
        {found > 0 ? `Search finished — ${found} suggestion${found === 1 ? '' : 's'} below.` : 'Search finished — no new businesses found.'}
      </p>
    );
  }
  if (progress === 'failed') {
    return (
      <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
        The search didn&apos;t finish. Your earlier suggestions are still here. Try again later.
      </p>
    );
  }
  if (progress === 'gave_up') {
    return <p className="rounded-lg bg-muted-surface p-3 text-ink">Still searching — check back in a few minutes.</p>;
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
const KM_PER_MILE = 1.609344;

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
  const meta = [s.category, s.distanceKm !== null ? `${(s.distanceKm / KM_PER_MILE).toFixed(1)} mi` : null, s.domain].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-3 rounded-lg border border-line p-3">
      {selectable && <input type="checkbox" className="mt-1.5 h-4 w-4 accent-primary" aria-label={`Track ${s.name}`} checked={checked} disabled={checkDisabled} onChange={onToggle} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{s.name}</p>
          {s.tier && <TierChip tier={s.tier} />}
        </div>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        <SignalPills signals={s.signals} mode="suggestion" />
        {hasUnchecked(s.signals) && <p className="text-xs text-muted-foreground">Some signals unavailable</p>}
      </div>
      {dismiss}
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
}: {
  clientId: string;
  /** Keywords, a service area and a Google place id are all present. */
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
}) {
  const [state, formAction, pending] = useActionState(requestSuggestionsAction, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const { progress, status } = useSearchProgress(clientId, initialSearch, state, canSearch && !readOnly);
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
    <Card>
      <CardHeader>
        <CardTitle>Suggested competitors</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {canSearch && !readOnly && !ready && (
          <p className="text-muted-foreground">
            Add keywords, a service area and a Google place id to search.{' '}
            <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">
              Go to Profile
            </Link>
          </p>
        )}
        {readOnly ? null : canSearch ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Button type="submit" disabled={!ready || pending || searching} className="self-start">
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Searching…
                </>
              ) : (
                'Find competitors'
              )}
            </Button>
            <p className="text-sm text-muted-foreground">Searches Google Maps across the service area (paid; runs in the background, usually 1–4 minutes)</p>
            {!state.ok && <Message state={state} />}
            <SearchProgress progress={progress} status={status} found={suggestions.length} />
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Your account manager can look for more competitors for you.</p>
        )}
        <Message state={rowState} />
        <Message state={bulkState} />
        {suggestions.length === 0 && !searching && <p className="text-muted-foreground">No competitors found yet. Add keywords and a service area, then search.</p>}
        {groups.map((g) => (
          <section key={g.tier} className="flex flex-col gap-3" aria-labelledby={`tier-${g.tier}`}>
            <h3 id={`tier-${g.tier}`} className="text-sm font-bold text-ink">
              {TIER_LABEL[g.tier]}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
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
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-md">
            <Button type="button" onClick={track} disabled={selected.size === 0 || selected.size > room || tracking} title={room === 0 ? `This client already tracks ${limit} competitors` : undefined}>
              Track selected ({selected.size})
            </Button>
            {room === 0 && <span className="text-sm text-muted-foreground">This client already tracks {limit} competitors</span>}
            {room > 0 && selected.size >= room && <span className="text-sm text-muted-foreground">You can track {room} more.</span>}
          </div>
        )}
        {hiddenList.length > 0 && (
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Show {hiddenList.length} hidden</summary>
            <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
              {hiddenList.map((h, i) => (
                <li key={`${h.name}-${i}`} className="flex flex-wrap justify-between gap-2">
                  <span>{h.name}</span>
                  <span className="text-muted-foreground">{HIDDEN_LABEL[h.reason]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitor-name">Name</Label>
          <Input id="competitor-name" name="name" required className="w-48" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitor-domain">Website</Label>
          <Input id="competitor-domain" name="domain" placeholder="smithhvac.com" className="w-56" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="competitor-place-id">Google place id (optional)</Label>
          <Input id="competitor-place-id" name="placeId" className="w-56" />
        </div>
        <Button type="submit" disabled={atLimit || pending} title={atLimit ? `This client already tracks ${limit} competitors` : undefined}>
          Add competitor
        </Button>
      </div>
    </form>
  );
}

function RemoveCompetitorButton({ clientId, competitorId, name, action, pending, result }: { clientId: string; competitorId: string; name: string; action: RowAction; pending: boolean; result: RowResult }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop tracking {name}?</DialogTitle>
          <DialogDescription>Its history is kept, and collection stops if no other client tracks it.</DialogDescription>
        </DialogHeader>
        {!result.ok && result.rowId === competitorId && <Message state={result} />}
        <form action={action}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="competitorId" value={competitorId} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              Stop tracking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The tracked-competitors table; a successful removal's message shows above it (a refusal shows in the open dialog). */
export function TrackedCompetitorsTable({ clientId, items, canRemove: canRemoveProp, signals = [] }: { clientId: string; items: TrackedCompetitor[]; canRemove: boolean; signals?: CompetitorSignalView[] }) {
  const byCompetitor = new Map(signals.map((x) => [x.competitorId, x]));
  const canRemove = canRemoveProp && !useReadOnly();
  const [result, action, pending] = useActionState(removeAction, { ok: true } as RowResult);
  return (
    <div className="flex flex-col gap-4">
      {result.ok && <Message state={result} />}
      {items.length === 0 ? (
        <p className="text-muted-foreground">{canRemove ? 'None yet — accept a suggestion or add one below.' : 'No competitors tracked yet.'}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Signals</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Pages monitored</TableHead>
              <TableHead>Since</TableHead>
              {canRemove && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => {
              const rated = byCompetitor.get(c.id);
              return (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/c/${clientId}/competitors/${c.id}`} className="font-semibold text-primary-soft-text">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {rated ? (
                    <div className="flex flex-col gap-1">
                      <TierChip tier={rated.tier} />
                      <span className="text-xs text-muted-foreground">{ratedLabel(rated.computedAt)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not rated yet</span>
                  )}
                </TableCell>
                <TableCell>{rated ? <SignalPills signals={rated.signals} mode="tracked" /> : '—'}</TableCell>
                <TableCell>{c.domain ?? '—'}</TableCell>
                <TableCell>{c.activePages}</TableCell>
                <TableCell>{c.addedAt.slice(0, 10)}</TableCell>
                {canRemove && (
                  <TableCell>
                    <RemoveCompetitorButton clientId={clientId} competitorId={c.id} name={c.name} action={action} pending={pending} result={result} />
                  </TableCell>
                )}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
