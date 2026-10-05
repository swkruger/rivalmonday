'use client';
import type { SuggestionView } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@cs/ui';
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

function AcceptSuggestionForm({ clientId, suggestion, atLimit }: { clientId: string; suggestion: SuggestionView; atLimit: boolean }) {
  const [state, formAction, pending] = useActionState(acceptSuggestionAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button type="submit" size="sm" disabled={atLimit || pending} title={atLimit ? 'This client already tracks 5 competitors' : undefined} aria-label={`Accept ${suggestion.name}`}>
        Accept
      </Button>
      <Message state={state} />
    </form>
  );
}

function DismissSuggestionForm({ clientId, suggestion }: { clientId: string; suggestion: SuggestionView }) {
  const [state, formAction, pending] = useActionState(dismissSuggestionAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={`Dismiss ${suggestion.name}`}>
        Dismiss
      </Button>
      <Message state={state} />
    </form>
  );
}

export function SuggestionsPanel({
  clientId,
  ready,
  suggestions,
  atLimit,
}: {
  clientId: string;
  ready: boolean;
  suggestions: SuggestionView[];
  atLimit: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestSuggestionsAction, { ok: true } as FormResult);
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
                  <AcceptSuggestionForm clientId={clientId} suggestion={s} atLimit={atLimit} />
                  <DismissSuggestionForm clientId={clientId} suggestion={s} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AddCompetitorForm({ clientId, atLimit }: { clientId: string; atLimit: boolean }) {
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
        <Button type="submit" disabled={atLimit || pending} title={atLimit ? 'This client already tracks 5 competitors' : undefined}>
          Add competitor
        </Button>
      </div>
    </form>
  );
}

export function RemoveCompetitorButton({ clientId, competitorId, name }: { clientId: string; competitorId: string; name: string }) {
  const [state, formAction, pending] = useActionState(removeCompetitorAction, { ok: true } as FormResult);
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
        <Message state={state} />
        <form action={formAction}>
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
