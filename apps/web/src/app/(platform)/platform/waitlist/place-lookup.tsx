'use client';
import type { SetupLookup } from '@cs/db';
import { Button, Input, Label, Tag } from '@cs/ui';
import { useId, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';

/** A match from `platform_find_business`: the listing plus hints that never travel with the picked place. */
export type FoundPlace = SetupLookup & { possibleDuplicate: boolean; suggestedVerticalId: string | null };
export type FindPlacesResult = { ok: true; places: FoundPlace[] } | { ok: false; error: string };
export type FindPlaces = (input: { name: string; location: string }) => Promise<FindPlacesResult>;

/** The listing as stored on the lead (`intakeLookupSchema`): the search hints are dropped. */
export function lookupOf(p: FoundPlace): SetupLookup {
  const { possibleDuplicate: _dup, suggestedVerticalId: _vertical, ...lookup } = p;
  return lookup;
}

/**
 * Self-contained Google-listing picker (Phase 17a tasks 9 and 10). Name and City/ZIP start from the given prefill; Search calls
 * `find`; the matches are a radio list (up to 5). The picked listing travels in a hidden field named `fieldName` as JSON
 * (`SetupLookup`, no hints) and also goes to `onPick` (null again when a new search clears it). It renders no `<form>`, so it
 * sits inside any form or dialog; Search is a plain button and Enter in a field searches instead of submitting.
 */
export function PlaceLookup({ initialName, initialLocation, find, fieldName = 'lookup', onPick, disabled = false }: {
  initialName: string;
  initialLocation: string;
  find: FindPlaces;
  fieldName?: string;
  /** `place` (with its hints, e.g. `suggestedVerticalId`) comes with a pick; a cleared pick passes null alone. */
  onPick?: (lookup: SetupLookup | null, place?: FoundPlace) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [places, setPlaces] = useState<FoundPlace[] | null>(null);
  const [picked, setPicked] = useState<FoundPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [searching, startSearch] = useTransition();
  const ready = name.trim().length > 0 && location.trim().length >= 2;

  const search = () => {
    if (!ready || searching) return;
    setError(null);
    setAttempt((n) => n + 1);
    setPicked(null);
    onPick?.(null);
    startSearch(async () => {
      const r = await find({ name: name.trim(), location: location.trim() });
      if (r.ok) setPlaces(r.places);
      else {
        setPlaces(null);
        setError(r.error);
      }
    });
  };
  const pick = (p: FoundPlace) => {
    setPicked(p);
    onPick?.(lookupOf(p), p);
  };
  const enterSearches = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    search();
  };

  return (
    <div className="flex flex-col gap-3">
      {picked && <input type="hidden" name={fieldName} value={JSON.stringify(lookupOf(picked))} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`}>Business name</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enterSearches} maxLength={120} disabled={disabled} className="w-60" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-location`}>City or ZIP</Label>
          <Input id={`${id}-location`} value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={enterSearches} maxLength={120} disabled={disabled} className="w-48" />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={disabled || searching || !ready}>{searching ? 'Searching…' : 'Search'}</Button>
      </div>
      {error && <ErrorNote compact focusKey={attempt}>{error}</ErrorNote>}
      {places && places.length === 0 && <p role="status" className="text-sm text-muted-ink">No businesses found. Check the spelling or try a ZIP code.</p>}
      {places && places.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Matching businesses">
          {places.map((p) => {
            const on = picked?.placeId === p.placeId;
            return (
              <li key={p.placeId}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${on ? 'border-primary bg-white shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line hover:bg-canvas'}`}>
                  <input type="radio" name={`${id}-listing`} checked={on} onChange={() => pick(p)} disabled={disabled} className="mt-1 size-4" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{p.title}</span>
                      {p.possibleDuplicate && <Tag>Possible duplicate</Tag>}
                    </span>
                    <span className="text-sm text-muted-ink">{p.address || 'Address hidden — service-area business'}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
