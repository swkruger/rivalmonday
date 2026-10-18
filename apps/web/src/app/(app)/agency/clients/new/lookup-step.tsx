'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState, useTransition } from 'react';
import { ClientProfileForm } from '@/components/client-profile-form';
import { ErrorNote, FormError } from '@/components/form-error';
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
  timezoneOptions: string[];
  canUpgrade?: boolean;
  /** Label of the by-hand form's submit button (prospects: "Create prospect"). */
  byHandSubmitLabel?: string;
  createLabel?: string;
}

/** Phase 11a §5: find the business on Google Maps first; the profile form is the fallback. */
export function LookupStep({ find, createFromLookup, createByHand, verticals, timezoneOptions, canUpgrade, byHandSubmitLabel, createLabel = 'Create client' }: Props) {
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
                  <span className="font-semibold">{p.title}</span>
                  {p.address && <span className="text-muted-foreground">{p.address}</span>}
                  <span className="text-muted-foreground">
                    {[p.category, p.rating !== null ? `${p.rating} ★${p.votes !== null ? ` ${p.votes.toLocaleString('en-US')}` : ''}` : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {picked && <CreateForm key={picked.placeId} place={picked} action={createFromLookup} verticals={verticals} canUpgrade={canUpgrade} label={createLabel} />}

      <button type="button" onClick={() => setByHand(true)} className="self-start text-sm font-semibold text-secondary underline">Can’t find it? Enter details by hand</button>
    </div>
  );
}

function CreateForm({ place, action, verticals, canUpgrade, label }: { place: Place; action: Props['createFromLookup']; verticals: VerticalOption[]; canUpgrade?: boolean; label: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      <input type="hidden" name="lookup" value={JSON.stringify(place)} />
      <FormError state={state} canUpgrade={canUpgrade === true} />
      <fieldset disabled={readOnly} className="contents">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lookupName">Business name</Label>
          <Input id="lookupName" name="name" required maxLength={120} defaultValue={place.title} className="max-w-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lookupVertical">Vertical</Label>
          <select id="lookupVertical" name="verticalId" defaultValue={place.suggestedVerticalId ?? ''} required className={selectClass}>
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
