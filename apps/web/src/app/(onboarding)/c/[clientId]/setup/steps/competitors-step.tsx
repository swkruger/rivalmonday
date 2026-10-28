'use client';
import type { Tier } from '@cs/tools';
import { Button } from '@cs/ui';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { Scorecard } from '@/components/onboarding/previews/scorecard';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { TierChip } from '@/components/rival/tier-chip';
import { formatMilesAway } from '@/lib/format';
import type { ClientSafeSuggestion, ClientSetupView } from '../types';
import { type StepFrame, stepOf } from './frame';

/** The most rivals a person picks here (the brief covers all of them; the scorecard draws the first two). */
export const MAX_PICKS = 5;
const TIER_ORDER: Tier[] = ['top', 'watch', 'minor'];
const FIRST_SHOWN = 5;
const HELP_KEY = 'page:client.setup';
/** The owner's screen has its own help page (`client.setup.competitors`), not the staff wizard's. */
const OWNER_KEY = 'page:client.setup.competitors';

function progressLine(search: ClientSetupView['search']): string | null {
  if (!search) return null;
  const { progress: p, status } = search;
  if ((status === 'checking' || status === 'finalising') && p.checksTotal > 0) return `Checking ads and reviews for ${p.checksTotal} businesses. You can leave this page; it keeps going.`;
  if (p.searchesTotal > 0) return `${p.searchesDone} of ${p.searchesTotal} searches. Usually under a minute. You can leave this page; it keeps going.`;
  return 'Usually under a minute. You can leave this page; it keeps going.';
}

const ratedLine = (s: ClientSafeSuggestion) =>
  [s.distanceKm != null ? `${formatMilesAway(s.distanceKm)}` : null, s.rating != null ? `★ ${s.rating.toFixed(1)}${s.votes != null ? ` (${s.votes})` : ''}` : null].filter(Boolean).join(' · ');

/**
 * Step 4 (spec 16 §6): the competitor search runs by itself once step 3 is saved. This screen shows its progress, then the
 * suggestions to tick (up to 5, in the order ticked; Top rivals arrive ticked), with the "Where you stand" scorecard for
 * the business and the first two ticked rivals. "Ask the owner to pick" hands the choice to the owner instead.
 */
export function CompetitorsStep({ frame, view, clientId, clientName, ownerName, keywordCount, radiusMiles, backHref, pending, error, refusal, owner, onStart, onSkip, onContinue, onAskOwner, onCancelAsk, onNext }: {
  frame: StepFrame; view: ClientSetupView; clientId: string; clientName: string;
  /** The owner's own pick screen (16 §7): they pick while `waiting_owner`, with no progress, Back, Skip or "Ask the owner". */
  owner?: { agencyName: string; place: string | null };
  /** First name for the owner-picking note; null when no owner is known. */
  ownerName: string | null; keywordCount: number; radiusMiles: number; backHref?: string; pending: boolean; error: string | null;
  /** A failed or refused search, already in plain words. */
  refusal: string | null;
  onStart: () => void; onSkip: () => void; onContinue: (accept: string[]) => void; onAskOwner: () => void;
  /** Staff take back an "Ask the owner" request (`cancel_ask_owner`); the step reads `ready` again. */
  onCancelAsk: () => void;
  /** Leave without a pick (the owner is choosing, or the step is already closed). */
  onNext: () => void;
}) {
  const readOnly = useReadOnly();
  const state = view.state.competitors;
  const all = view.competitorSuggestions.filter((s) => s.status !== 'dismissed');
  const tracked = all.filter((s) => s.status === 'accepted');
  const open = TIER_ORDER.flatMap((t) => all.filter((s) => s.tier === t && s.status === 'suggested'));
  const room = Math.max(0, MAX_PICKS - tracked.length);

  // Ticked ids in the order they were ticked. Untouched, the pre-ticked Top rivals (as many as fit) stand in.
  const [touched, setTouched] = useState<string[] | null>(null);
  const ticked = touched ?? open.filter((s) => s.preTicked).map((s) => s.id).slice(0, room);
  const toggle = (id: string) => setTouched(ticked.includes(id) ? ticked.filter((x) => x !== id) : ticked.length < room ? [...ticked, id] : ticked);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? open : open.slice(0, FIRST_SHOWN);

  const byId = new Map(all.map((s) => [s.id, s]));
  const scored = [...tracked, ...ticked.map((id) => byId.get(id)!).filter(Boolean)].map((s) => ({ name: s.name, rating: s.rating, reviews: s.votes }));
  const you = { name: clientName, rating: view.lookup?.rating ?? null, reviews: view.lookup?.votes ?? null };

  const searching = state === 'searching';
  const picking = state === 'ready' || (owner !== undefined && state === 'waiting_owner');
  const closed = state === 'done' || state === 'skipped';
  const idle = state === 'todo' || state === 'blocked';
  const total = tracked.length + open.length;
  // I1: only once the search found businesses to choose from (`advance_client_setup` refuses otherwise).
  const canAsk = !owner && state === 'ready' && open.length > 0;
  const n = ticked.length;
  const progress = view.search?.progress;
  const pct = progress && progress.searchesTotal > 0 ? Math.round((progress.searchesDone / progress.searchesTotal) * 100) : 5;
  const subtitle = owner
    ? `${owner.agencyName} found these businesses${owner.place ? ` near ${owner.place}` : ''}. Tick up to ${MAX_PICKS}. You can change them later.`
    : picking && total > 0 ? `We found ${total} ${total === 1 ? 'business' : 'businesses'} within ${radiusMiles} miles. Tick up to ${MAX_PICKS}.` : "We're looking for businesses competing for the same customers.";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (picking) onContinue(ticked);
    else onNext();
  };

  return (
    <OnboardingShell
      brand={frame.brand}
      exitSlot={frame.exitSlot}
      step={owner ? undefined : stepOf(frame, 'competitors')}
      label={owner ? 'Choose competitors' : undefined}
      title={owner ? 'Choose who to watch' : 'Pick who to watch'}
      subtitle={subtitle}
      helpKey={owner ? OWNER_KEY : HELP_KEY}
      guide={frame.guide}
      preview={<PreviewWindow chrome={false} width={520}><Scorecard you={you} rivals={scored} /></PreviewWindow>}
      caption={<><b className="font-semibold">Live preview.</b> {scored.length > 0 ? `You and the first two rivals you tick. The brief covers all ${Math.max(scored.length, 1)}.` : `Tick rivals to compare them with ${clientName}.`}</>}
      footer={
        <StepFooter
          back={owner ? undefined : backHref}
          skip={canAsk ? { label: 'Ask the owner to pick', onSkip: onAskOwner, disabled: readOnly || pending } : undefined}
          primary={owner
            ? { label: n > 0 ? `Confirm ${n} ${n === 1 ? 'competitor' : 'competitors'}` : 'Confirm competitors', pending, disabled: readOnly || n === 0, form: 'competitors-form' }
            : { label: state === 'ready' && n > 0 ? `Continue with ${n}` : 'Continue', pending, disabled: readOnly || searching || idle, form: 'competitors-form' }}
        />
      }
    >
      {error && <ErrorNote focusKey={error}>{error}</ErrorNote>}
      <form id="competitors-form" onSubmit={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        {searching && (
          <div role="status" className="flex flex-col gap-2.5">
            <p className="flex items-center gap-2 text-sm font-medium"><Loader2 className="size-4 animate-spin" aria-hidden />Searching {keywordCount} {keywordCount === 1 ? 'keyword' : 'keywords'} across your area…</p>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted-surface"><b className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <p className="text-13 text-muted-ink">{progressLine(view.search) ?? 'Usually under a minute. You can leave this page; it keeps going.'}</p>
            <div aria-hidden="true" className="mt-2 flex flex-col gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3 rounded-md border border-line px-3.5 py-3"><span className="size-[18px] rounded border border-line-control" /><span className="h-2.5 w-2/5 rounded-full bg-muted-surface" /></div>)}
            </div>
          </div>
        )}

        {idle && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-ink">We search Google Maps around the service area for the businesses customers compare you with.</p>
            {refusal && <ErrorNote>{refusal}</ErrorNote>}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={onStart}>Find competitors</Button>
                <Button type="button" variant="outline" disabled={pending} onClick={onSkip}>Skip this step</Button>
              </div>
            )}
          </div>
        )}

        {state === 'waiting_owner' && !owner && (
          <div className="flex flex-col gap-2">
            <p role="status" className="rounded-md bg-muted-surface p-3 text-sm">{ownerName ?? 'The owner'} is choosing the competitors. They show up on their Overview, and we start watching once they have picked.</p>
            {!readOnly && <Button type="button" variant="outline" className="self-start" disabled={pending} onClick={onCancelAsk}>Cancel request</Button>}
          </div>
        )}
        {closed && (
          <p role="status" className="rounded-md bg-muted-surface p-3 text-sm">{tracked.length > 0 ? `Competitors are chosen: ${tracked.length} tracked.` : 'This step was skipped. You can add competitors any time on the Competitors page.'}</p>
        )}

        {(picking || (closed && tracked.length > 0)) && (
          <>
            {picking && open.length === 0 && tracked.length === 0 && <p className="text-sm text-muted-ink">No new businesses were found. You can add competitors by hand later.</p>}
            <ul className="flex flex-col gap-2" aria-label="Suggested competitors">
              {tracked.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-md border border-line px-3.5 py-2.5">
                  <input type="checkbox" checked disabled aria-label={s.name} className="size-[18px]" />
                  <span className="min-w-0 flex-1"><span className="font-medium">{s.name}</span><span className="block text-13 text-muted-ink">{ratedLine(s)}</span></span>
                  <span className="text-sm font-semibold">Tracking</span>
                </li>
              ))}
              {shown.map((s) => {
                const on = ticked.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 ${on ? 'border-primary bg-white shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line hover:bg-canvas'}`}>
                      <input type="checkbox" aria-label={s.name} checked={on} disabled={readOnly || (!on && ticked.length >= room)} onChange={() => toggle(s.id)} className="size-[18px]" />
                      <span className="min-w-0 flex-1"><span className="font-medium">{s.name}</span><span className="block text-13 text-muted-ink">{ratedLine(s)}</span></span>
                      <TierChip tier={s.tier} />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-4 text-sm font-medium text-secondary">
              {!showAll && open.length > FIRST_SHOWN && <button type="button" onClick={() => setShowAll(true)}>Show {open.length - FIRST_SHOWN} more</button>}
              {picking && !owner && <Link href={`/c/${clientId}/competitors`}>+ Add one we missed</Link>}
            </div>
          </>
        )}
      </form>
    </OnboardingShell>
  );
}
