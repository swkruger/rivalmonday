'use client';
import { Field, Input } from '@cs/ui';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { RadiusMap } from '@/components/onboarding/previews/radius-map';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { kmToMiles, radiusKmFromMiles } from '@/lib/format';
import type { AreaInput } from '../actions';
import type { ClientSetupView, ProfileInitial } from '../types';
import { type StepFrame, stepOf } from './frame';

/** Step 3's radius choices, in miles (the form stores kilometres). */
const RADIUS_MILES = [5, 10, 15, 25] as const;
const DEFAULT_MILES = 10;

const toggled = (set: Set<string>, v: string) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

/**
 * Step 3 (spec 16 §6): what the business does and where. Up to 5 keyword chips (the seed keywords of the business type
 * until the Google suggestions arrive, then those, as long as the chips are untouched), a radius in miles and, when the
 * client has no location yet, a City or ZIP. Services stay a collapsed line. Saving starts the competitor search.
 */
export function AreaStep({ frame, view, profile, clientName, around, maxKeywords, pending, error, onSave }: {
  frame: StepFrame; view: ClientSetupView; profile: ProfileInitial; clientName: string;
  /** "1801 Sam Bass Rd, Round Rock": where the radius is measured from, when known. */
  around: string | null; maxKeywords: number; pending: boolean; error: string | null; onSave: (input: AreaInput) => void;
}) {
  const readOnly = useReadOnly();
  const ready = view.suggestions.status === 'ready' ? view.suggestions : null;
  const suggestedKeywords = ready?.keywords.map((k) => k.value) ?? [];
  const fromGoogle = profile.keywords.length === 0 && suggestedKeywords.length > 0;
  const base = profile.keywords.length > 0 ? profile.keywords : suggestedKeywords.length > 0 ? suggestedKeywords : view.vertical.seedKeywords;

  // Chips: the person's own edits win; until then, whatever the best source is right now.
  const [edited, setEdited] = useState<string[] | null>(null);
  const keywords = edited ?? base.slice(0, maxKeywords);
  const [draftKeyword, setDraftKeyword] = useState('');
  const addKeyword = () => {
    const k = draftKeyword.trim().replace(/\s+/g, ' ');
    setDraftKeyword('');
    if (k.length < 2 || keywords.length >= maxKeywords || keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return;
    setEdited([...keywords, k]);
  };

  // The saved radius when this step was saved before; otherwise 10 miles, whatever the listing lookup stored.
  const savedKm = view.state.steps.profile === 'done' && profile.serviceArea ? profile.serviceArea.radiusKm : null;
  const choices = RADIUS_MILES.map((mi) => ({ mi, stored: radiusKmFromMiles(mi) }));
  const custom = savedKm !== null && !choices.some((c) => c.stored === savedKm) ? { mi: Math.round(kmToMiles(savedKm)), stored: savedKm } : null;
  const [radiusKm, setRadiusKm] = useState(savedKm ?? radiusKmFromMiles(DEFAULT_MILES));
  const miles = Math.round(kmToMiles(radiusKm));

  // Services: collapsed to one line; "New" areas (14a) are Google services that match none of ours.
  const [servicesEdited, setServicesEdited] = useState<Set<string> | null>(null);
  const services = servicesEdited ?? new Set([...profile.services, ...(ready?.services.map((s) => s.value) ?? [])]);
  const known = new Set(view.vertical.services.map((v) => v.name.trim().toLowerCase()));
  const newAreas = (ready?.newAreas ?? []).filter((a) => !known.has(a.name.trim().toLowerCase()));
  const [pickedNew, setPickedNew] = useState<Set<string>>(() => new Set());
  const [servicesOpen, setServicesOpen] = useState(false);
  const [locality, setLocality] = useState('');
  const needsLocation = view.state.needsLocation;

  const canContinue = keywords.length > 0 && (!needsLocation || locality.trim().length > 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    onSave({ keywords, radiusKm, services: [...services], newAreas: [...pickedNew], ...(needsLocation ? { locality: locality.trim() } : {}) });
  };
  const serviceLine = services.size > 0 ? `${services.size} ${services.size === 1 ? 'service' : 'services'}${ready?.services.length ? ' from Google' : ''}` : 'No services picked yet';

  return (
    <OnboardingShell
      brand={frame.brand}
      exitSlot={frame.exitSlot}
      step={stepOf(frame, 'profile')}
      title="What they do and where"
      subtitle="We search these words around the business to find its rivals."
      helpKey="page:client.setup"
      guide={frame.guide}
      preview={<PreviewWindow chrome={false} width={620}><RadiusMap miles={miles} business={clientName} /></PreviewWindow>}
      caption={<>Searching <b className="font-semibold text-ink">{keywords.length} {keywords.length === 1 ? 'keyword' : 'keywords'}</b> within <b className="font-semibold text-ink">{miles} miles</b> of {clientName}</>}
      footer={<StepFooter primary={{ label: 'Continue', pending, disabled: readOnly || !canContinue, form: 'area-form' }} />}
    >
      {error && <ErrorNote focusKey={error}>{error}</ErrorNote>}
      <form id="area-form" onSubmit={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-5">
        <fieldset disabled={readOnly} className="contents">
          <Field htmlFor="keyword-add" label="Search keywords" required help={`${keywords.length} of ${maxKeywords}.${edited === null && fromGoogle ? ' Suggested from their Google listing.' : ''}`}>
            <div role="group" aria-label="Search keywords" className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-sm border border-input bg-white p-1.5">
              {keywords.map((k) => (
                <span key={k} data-chip="" className="inline-flex h-[26px] items-center gap-1 rounded-full bg-muted-surface pl-2.5 pr-1.5 text-13">
                  {k}
                  <button type="button" aria-label={`Remove ${k}`} onClick={() => setEdited(keywords.filter((x) => x !== k))} className="text-11 text-muted-ink hover:text-ink">✕</button>
                </span>
              ))}
              <input
                id="keyword-add" aria-describedby="keyword-add-help" aria-label="Add a keyword" placeholder={keywords.length >= maxKeywords ? '' : 'Add a keyword'} value={draftKeyword} maxLength={60}
                disabled={keywords.length >= maxKeywords}
                onChange={(e) => setDraftKeyword(e.target.value)} onBlur={addKeyword}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                className="min-w-[120px] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-ink disabled:cursor-not-allowed"
              />
            </div>
          </Field>

          {needsLocation && (
            <Field label="City or ZIP" required help="We could not place this business from its address. Where is it?">
              <Input id="locality" name="locality" value={locality} onChange={(e) => setLocality(e.target.value)} maxLength={120} className={INPUT_CLASS} aria-required placeholder="Round Rock, TX" />
            </Field>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend id="radius-legend" className="mb-1.5 text-sm font-medium">Search radius<span aria-hidden="true" className="ml-0.5 text-destructive">*</span><span className="sr-only"> (required)</span></legend>
            <div role="radiogroup" aria-labelledby="radius-legend" className="inline-flex w-fit overflow-hidden rounded-md border border-input">
              {(custom ? [custom, ...choices] : choices).map((c) => (
                <label key={c.stored} className="flex h-9 cursor-pointer items-center border-r border-line px-[18px] text-sm last:border-r-0 has-[:checked]:bg-primary-soft has-[:checked]:font-semibold has-[:checked]:text-primary-soft-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
                  <input type="radio" name="radius" value={c.stored} checked={radiusKm === c.stored} onChange={() => setRadiusKm(c.stored)} className="sr-only" />
                  {custom && c === custom ? `≈ ${c.mi} mi (custom)` : `${c.mi} mi`}
                </label>
              ))}
            </div>
            <p className="text-13 text-muted-ink">{around ? `Around ${around}.` : 'Around the business location.'}</p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <div className="text-sm font-medium">Services <span className="font-normal text-muted-ink">(optional)</span></div>
            <div className="flex items-center gap-2.5 text-sm">
              <span>{serviceLine}</span>
              <button type="button" aria-expanded={servicesOpen} onClick={() => setServicesOpen((o) => !o)} className="text-13 font-medium text-secondary">Review {servicesOpen ? '▴' : '▾'}</button>
            </div>
            {servicesOpen && (
              <div role="group" aria-label="Services the business offers" className="mt-1 flex flex-wrap gap-2">
                {view.vertical.services.map((s) => (
                  <label key={s.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm ${services.has(s.id) ? 'bg-primary-soft font-semibold text-primary-soft-text' : 'bg-muted-surface'}`}>
                    <input type="checkbox" checked={services.has(s.id)} onChange={() => setServicesEdited(toggled(services, s.id))} className="size-4" />
                    {s.name}
                  </label>
                ))}
                {newAreas.map((a) => (
                  <label key={a.name} title={`From Google: “${a.quote}”`} className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm ${pickedNew.has(a.name) ? 'bg-primary-soft font-semibold text-primary-soft-text' : 'bg-muted-surface'}`}>
                    <input type="checkbox" checked={pickedNew.has(a.name)} onChange={() => setPickedNew(toggled(pickedNew, a.name))} className="size-4" />
                    {a.name}
                    <span className="rounded-full bg-white px-2 text-xs font-semibold">New</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-13 text-muted-ink">{newAreas.length > 0 && servicesOpen ? 'Not in our list yet: tick to add it as a service; our team reviews new ones. ' : ''}Used to compare what each rival offers. Towns and ZIPs live in Settings.</p>
          </div>
        </fieldset>
      </form>
    </OnboardingShell>
  );
}
