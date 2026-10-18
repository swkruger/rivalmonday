'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState, useTransition } from 'react';
import { ClientProfileForm } from '@/components/client-profile-form';
import { ErrorNote, FormError } from '@/components/form-error';
import { NewBusinessType, type VerticalActions, useVerticalChoice } from '@/components/new-business-type';
import { DuplicateHint, PlaceSummary } from '@/components/place-summary';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';
import type { FindBusinessResult } from './actions';

type Place = Extract<FindBusinessResult, { ok: true }>['places'][number];

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Props {
  find: (input: { name: string; location: string }) => Promise<FindBusinessResult>;
  createFromLookup: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  /** The old by-hand form's action: unchanged create path. */
  createByHand: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  verticals: VerticalOption[];
  /** Draft/create a business type when the picked place matches none (omitted: no panel). */
  verticalActions?: VerticalActions;
  timezoneOptions: string[];
  canUpgrade?: boolean;
  /** Label of the by-hand form's submit button (prospects: "Create prospect"). */
  byHandSubmitLabel?: string;
  createLabel?: string;
}

/** Phase 11a §5: find the business on Google Maps first; the profile form is the fallback. */
export function LookupStep({ find, createFromLookup, createByHand, verticals, verticalActions, timezoneOptions, canUpgrade, byHandSubmitLabel, createLabel = 'Create client' }: Props) {
  const [byHand, setByHand] = useState(false);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<Place | null>(null);
  const [searching, startSearch] = useTransition();
  const readOnly = useReadOnly();

  if (byHand) {
    return (
      <>
        <ClientProfileForm mode="create" submitLabel={byHandSubmitLabel} action={createByHand} verticals={verticals} timezoneOptions={timezoneOptions} canUpgrade={canUpgrade} />
        <button type="button" onClick={() => setByHand(false)} className="self-start text-sm font-semibold text-secondary underline">Search for the business instead</button>
      </>
    );
  }

  const search = (fd: FormData) => {
    setError(null);
    setAttempt((n) => n + 1);
    setPicked(null);
    startSearch(async () => {
      const r = await find({ name: String(fd.get('businessName') ?? ''), location: String(fd.get('location') ?? '') });
      if (r.ok) setPlaces(r.places);
      else {
        setPlaces(null);
        setError(r.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <form action={search} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
        {error && <ErrorNote focusKey={attempt}>{error}</ErrorNote>}
        <fieldset disabled={readOnly || searching} className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input id="businessName" name="businessName" required maxLength={120} className="w-72" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="location">City and state, or ZIP</Label>
            <Input id="location" name="location" required minLength={2} maxLength={120} className="w-64" />
          </div>
          <WriteGuard>
            <Button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Find business'}</Button>
          </WriteGuard>
        </fieldset>
      </form>

      {places && places.length === 0 && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">No businesses found. Check the spelling or try a ZIP code.</p>}

      {places && places.some((p) => p.possibleDuplicate) && <DuplicateHint />}

      {places && places.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Matching businesses">
          {places.map((p) => {
            const on = picked?.placeId === p.placeId;
            return (
              <li key={p.placeId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(p)}
                  className={`flex w-full flex-col gap-1 rounded-[14px] bg-surface p-4 text-left shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${on ? 'ring-2 ring-secondary' : 'hover:bg-muted-surface'}`}
                >
                  <PlaceSummary place={p} isClaimed={p.isClaimed} possibleDuplicate={p.possibleDuplicate} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {picked && <PickedPlace key={picked.placeId} place={picked} action={createFromLookup} verticals={verticals} verticalActions={verticalActions} canUpgrade={canUpgrade} label={createLabel} />}

      <button type="button" onClick={() => setByHand(true)} className="self-start text-sm font-semibold text-secondary underline">Can’t find it? Enter details by hand</button>
    </div>
  );
}

/** The "new business type" panel (when no vertical matched) above the create form; both share the vertical choice. */
function PickedPlace({ place, action, verticals, verticalActions, canUpgrade, label }: { place: Place; action: Props['createFromLookup']; verticals: VerticalOption[]; verticalActions?: VerticalActions; canUpgrade?: boolean; label: string }) {
  const choice = useVerticalChoice(verticals, place.suggestedVerticalId ?? '');
  return (
    <>
      {verticalActions && place.suggestedVerticalId === null && (
        <NewBusinessType place={{ placeId: place.placeId, category: place.category }} actions={verticalActions} onSelect={choice.choose} onCreated={choice.choose} />
      )}
      <CreateForm place={place} action={action} verticals={choice.options} verticalId={choice.value} onVerticalChange={(id) => choice.choose(id)} canUpgrade={canUpgrade} label={label} />
    </>
  );
}

function CreateForm({ place, action, verticals, verticalId, onVerticalChange, canUpgrade, label }: { place: Place; action: Props['createFromLookup']; verticals: VerticalOption[]; verticalId: string; onVerticalChange: (id: string) => void; canUpgrade?: boolean; label: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      <input type="hidden" name="lookup" value={JSON.stringify(place)} />
      <FormError state={state} canUpgrade={canUpgrade === true} />
      <fieldset disabled={readOnly} className="contents">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lookupName">Business name</Label>
          <Input id="lookupName" name="name" required maxLength={120} defaultValue={place.title} className="max-w-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lookupVertical">Vertical</Label>
          <select id="lookupVertical" name="verticalId" value={verticalId} onChange={(e) => onVerticalChange(e.target.value)} required className={selectClass}>
            {!place.suggestedVerticalId && <option value="" disabled>Choose a vertical</option>}
            {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </fieldset>
      <WriteGuard>
        <Button type="submit" disabled={pending} className="self-start">{label}</Button>
      </WriteGuard>
    </form>
  );
}
