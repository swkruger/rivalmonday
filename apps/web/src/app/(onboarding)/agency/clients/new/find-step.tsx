'use client';
import { Button, Input } from '@cs/ui';
import { useState, useTransition } from 'react';
import { ErrorNote, FormError } from '@/components/form-error';
import { NewBusinessType, type VerticalActions, useVerticalChoice } from '@/components/new-business-type';
import { Field, INPUT_CLASS, SELECT_CLASS } from '@/components/onboarding/field';
import { OnboardingShell, type OnboardingBrand } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { ListingMap } from '@/components/onboarding/previews/listing-map';
import { StepFooter } from '@/components/onboarding/step-footer';
import { DuplicateHint, PlaceSummary } from '@/components/place-summary';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';
import type { FindBusinessResult, FoundPlace } from './actions';
import type { FlowKind } from './details-step';

/** `page:agency.clients.new` for a client, `page:agency.prospects.new` for a prospect (same screens, different page guide). */
const helpKeyFor = (kind: FlowKind) => (kind === 'prospect' ? 'agency.prospects.new' : 'agency.clients.new');

export type Selection = { lookup: FoundPlace | null; verticalId: string; locality: string };

/**
 * Step 2 (spec 16 §6): find the business on Google. The search box starts from the business name typed in step 1 and
 * "City or ZIP" from its address; a listing, or "Continue without a listing", plus a business type completes the step,
 * and that is what creates the client (`onCreate`). The business type is pre-chosen from the listing's Google category.
 */
export function FindStep({ kind, brand, steps, initialName, initialLocation, find, verticals, verticalActions, onPick, onBack, onCreate, pending, result, canUpgrade, exitHref, guide }: {
  kind: FlowKind; brand: OnboardingBrand; steps: number; initialName: string; initialLocation: string;
  find: (input: { name: string; location: string }) => Promise<FindBusinessResult>;
  verticals: VerticalOption[]; verticalActions?: VerticalActions;
  /** The picked listing, so the flow can fill step 1's blank phone and address fields from it. */
  onPick: (place: FoundPlace) => void;
  onBack: () => void; onCreate: (selection: Selection) => void; pending: boolean; result: FormResult | null; canUpgrade: boolean;
  exitHref: string; guide: boolean;
}) {
  const readOnly = useReadOnly();
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [places, setPlaces] = useState<FoundPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<FoundPlace | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const choice = useVerticalChoice(verticals, '');

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAttempt((n) => n + 1);
    setPicked(null);
    choice.choose('');
    startSearch(async () => {
      const r = await find({ name, location });
      if (r.ok) setPlaces(r.places);
      else {
        setPlaces(null);
        setError(r.error);
      }
    });
  };

  const pick = (p: FoundPlace) => {
    setPicked(p);
    setNeed(null);
    choice.choose(p.suggestedVerticalId ?? '');
    onPick(p);
  };

  const submit = (lookup: FoundPlace | null) => {
    if (!choice.value) { setNeed('Choose a business type.'); document.getElementById('verticalId')?.focus(); return; }
    if (!lookup && !location.trim()) { setNeed('Enter a City or ZIP so we can place the business on the map.'); document.getElementById('location')?.focus(); return; }
    setNeed(null);
    onCreate({ lookup, verticalId: choice.value, locality: location.trim() });
  };

  const suggested = picked && picked.suggestedVerticalId !== null && picked.suggestedVerticalId === choice.value ? picked.category : null;
  const busy = pending || searching;

  return (
    <OnboardingShell
      brand={brand}
      step={{ n: 2, of: steps, label: 'Find the business' }}
      exit={{ href: exitHref, label: 'Exit' }}
      title="Find the business on Google"
      subtitle="We use the listing for their rating, reviews and location."
      helpKey={`page:${helpKeyFor(kind)}`}
      guide={guide}
      preview={<PreviewWindow chrome={false} width={620}><ListingMap place={picked} /></PreviewWindow>}
      caption={<><b className="font-semibold">Live preview.</b> The listing you picked. Blank details from step 1 are filled from it.</>}
      footer={<StepFooter back={onBack} primary={{ label: 'Continue', pending, disabled: readOnly || !picked || !choice.value, form: 'find-form' }} />}
    >
      <form id="find-form" onSubmit={(e) => { e.preventDefault(); if (picked) submit(picked); }} onReset={(e) => e.preventDefault()} className="contents" />
      <FormError state={result ?? { ok: true }} canUpgrade={canUpgrade} />
      <form onSubmit={search} className="flex flex-col gap-4">
        <fieldset disabled={readOnly || busy} className="flex flex-col gap-4">
          <Field id="businessName" label="Business name" required>
            <Input id="businessName" name="businessName" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={INPUT_CLASS} aria-required />
          </Field>
          <Field id="location" label="City or ZIP" required>
            <Input id="location" name="location" value={location} onChange={(e) => setLocation(e.target.value)} required minLength={2} maxLength={120} className={INPUT_CLASS} aria-required />
          </Field>
          <Button type="submit" variant="outline" className="self-start" disabled={!name.trim() || location.trim().length < 2}>{searching ? 'Searching…' : places ? 'Search again' : 'Find business'}</Button>
        </fieldset>
      </form>
      {error && <ErrorNote focusKey={attempt}>{error}</ErrorNote>}
      {places && places.length === 0 && <p role="status" className="rounded-lg bg-[#EEF2F6] p-3 text-sm text-ink">No businesses found. Check the spelling or try a ZIP code.</p>}
      {places && places.some((p) => p.possibleDuplicate) && <DuplicateHint />}
      {places && places.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Matching businesses">
          {places.map((p) => {
            const on = picked?.placeId === p.placeId;
            return (
              <li key={p.placeId}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-2.5 ${on ? 'border-primary bg-white shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line hover:bg-[#F6F9FC]'}`}>
                  <input type="radio" name="listing" checked={on} onChange={() => pick(p)} disabled={readOnly || pending} className="mt-1 size-4" />
                  <span className="flex min-w-0 flex-col gap-0.5"><PlaceSummary place={p} isClaimed={p.isClaimed} possibleDuplicate={p.possibleDuplicate} /></span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {picked && verticalActions && picked.suggestedVerticalId === null && (
        <NewBusinessType
          key={picked.placeId}
          place={{ placeId: picked.placeId, category: picked.category, businessName: picked.title }}
          actions={verticalActions}
          onSelect={(id, n) => choice.choose(id, n)}
          onCreated={(id, n) => choice.choose(id, n)}
        />
      )}
      <Field id="verticalId" label="Business type" required hint={need ?? (suggested ? `Chosen from the Google category "${suggested}".` : undefined)}>
        <select id="verticalId" name="verticalId" value={choice.value} onChange={(e) => choice.choose(e.target.value)} disabled={readOnly || pending} required aria-required className={SELECT_CLASS}>
          <option value="" disabled>Choose a business type</option>
          {choice.options.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      {!readOnly && (
        <button type="button" disabled={pending} onClick={() => submit(null)} className="self-start text-sm font-medium text-secondary disabled:opacity-50">
          Can&apos;t find it? Continue without a listing
        </button>
      )}
    </OnboardingShell>
  );
}
