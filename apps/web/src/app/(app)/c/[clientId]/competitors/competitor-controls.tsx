'use client';
import type { SuggestionView, TrackedCompetitor } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { acceptSuggestionAction, addCompetitorAction, dismissSuggestionAction, removeCompetitorAction, requestSuggestionsAction } from './actions';

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
 * Final-review fix: accept/dismiss state lives in `SuggestionsPanel` (and remove state in `TrackedCompetitorsTable`),
 * which stay mounted. Each action revalidates the page on success, which removes the suggestion row (or the tracked
 * competitor row and its dialog) in the same update; state held in the row would vanish before its message painted.
 */
async function suggestionAction(prev: RowResult, fd: FormData): Promise<RowResult> {
  const r = fd.get('intent') === 'dismiss' ? await dismissSuggestionAction(prev, fd) : await acceptSuggestionAction(prev, fd);
  return { ...r, rowId: String(fd.get('suggestionId') ?? '') };
}

async function removeAction(prev: RowResult, fd: FormData): Promise<RowResult> {
  const r = await removeCompetitorAction(prev, fd);
  return { ...r, rowId: String(fd.get('competitorId') ?? '') };
}

function AcceptSuggestionForm({ clientId, suggestion, atLimit, limit, action, pending }: { clientId: string; suggestion: SuggestionView; atLimit: boolean; limit: number; action: RowAction; pending: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="accept" />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button type="submit" size="sm" disabled={atLimit || pending} title={atLimit ? `This client already tracks ${limit} competitors` : undefined} aria-label={`Accept ${suggestion.name}`}>
        Accept
      </Button>
    </form>
  );
}

function DismissSuggestionForm({ clientId, suggestion, action, pending }: { clientId: string; suggestion: SuggestionView; action: RowAction; pending: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="dismiss" />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={`Dismiss ${suggestion.name}`}>
        Dismiss
      </Button>
    </form>
  );
}

export function SuggestionsPanel({
  clientId,
  ready,
  suggestions,
  atLimit,
  /**
   * Review Fix 2: the caller (`page.tsx`, a server file) passes the real `COMPETITOR_LIMIT` from `@cs/tools` so
   * the "at limit" copy never hardcodes the number. This component is `'use client'` and must not import a
   * runtime value from `@cs/tools` itself (common.md: don't pull server-only packages into client components —
   * pass data as props), so the default here only covers the brief's fixed test call, which omits the prop.
   */
  limit = 5,
}: {
  clientId: string;
  ready: boolean;
  suggestions: SuggestionView[];
  atLimit: boolean;
  limit?: number;
}) {
  const [state, formAction, pending] = useActionState(requestSuggestionsAction, { ok: true } as FormResult);
  const [rowState, rowAction, rowPending] = useActionState(suggestionAction, { ok: true } as RowResult);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggested competitors</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!ready && (
          <p className="text-muted-foreground">
            Add at least one keyword and a service area to the client profile before searching.{' '}
            <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">
              Go to Profile
            </Link>
          </p>
        )}
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" disabled={!ready || pending} className="self-start">
            Find competitors
          </Button>
          <p className="text-sm text-muted-foreground">Searches Google Maps across the service area (paid, about a minute of work in the background)</p>
          <Message state={state} />
        </form>
        <Message state={rowState} />
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-4">
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 rounded-lg border border-line p-3">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.domain ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.rating !== null ? `★ ${s.rating} (${s.votes ?? 0})` : null} seen in {s.appearances} searches, best rank #{s.bestRank ?? '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">Overlap {Math.round(s.overlapScore * 100)}%</p>
                </div>
                <div className="flex gap-2">
                  <AcceptSuggestionForm clientId={clientId} suggestion={s} atLimit={atLimit} limit={limit} action={rowAction} pending={rowPending} />
                  <DismissSuggestionForm clientId={clientId} suggestion={s} action={rowAction} pending={rowPending} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AddCompetitorForm({ clientId, atLimit, limit }: { clientId: string; atLimit: boolean; limit: number }) {
  const [state, formAction, pending] = useActionState(addCompetitorAction, { ok: true } as FormResult);
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
export function TrackedCompetitorsTable({ clientId, items }: { clientId: string; items: TrackedCompetitor[] }) {
  const [result, action, pending] = useActionState(removeAction, { ok: true } as RowResult);
  return (
    <div className="flex flex-col gap-4">
      {result.ok && <Message state={result} />}
      {items.length === 0 ? (
        <p className="text-muted-foreground">None yet — accept a suggestion or add one below.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Pages monitored</TableHead>
              <TableHead>Since</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/c/${clientId}/competitors/${c.id}`} className="font-semibold text-primary-soft-text">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.domain ?? '—'}</TableCell>
                <TableCell>{c.activePages}</TableCell>
                <TableCell>{c.addedAt.slice(0, 10)}</TableCell>
                <TableCell>
                  <RemoveCompetitorButton clientId={clientId} competitorId={c.id} name={c.name} action={action} pending={pending} result={result} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
