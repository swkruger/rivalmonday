'use client';
import { Button, Input, Label } from '@cs/ui';
import { useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { ClientSetupView } from '../types';

const areaClass = 'min-h-20 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const DEFAULT_RADIUS_KM = '15';

export interface ProfileInitial {
  services: string[];
  keywords: string[];
  placeId: string | null;
  serviceArea: { center: { lat: number; lng: number }; radiusKm: number; zips: string[]; towns?: string[] } | null;
}

type Suggestion = { value: string; quote: string };

/** A pack name for mid-sentence use: each word lowercased except all-caps tokens ("HVAC & Plumbing" -> "HVAC & plumbing"). */
export function inSentence(name: string): string {
  return name.split(' ').map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
}

/** The ready suggestions, or none: a ready set with both lists empty reads like a failed one (the seed keywords show instead). */
function readySuggestions(s: ClientSetupView['suggestions']): { services: Suggestion[]; keywords: Suggestion[] } | null {
  return s.status === 'ready' ? { services: s.services, keywords: s.keywords } : null;
}

function Chip({ checked, onToggle, label, value, name, quote, tag }: { checked: boolean; onToggle: () => void; label: string; value: string; name: string; quote?: string; tag?: string }) {
  return (
    <label
      title={quote ? `From Google: “${quote}”` : undefined}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${checked ? 'bg-primary-soft text-primary-soft-text' : 'bg-muted-surface text-ink'}`}
    >
      <input type="checkbox" name={name} value={value} checked={checked} onChange={onToggle} className="h-4 w-4" />
      {label}
      {tag && <span className="rounded-full bg-surface px-2 text-xs font-semibold text-ink">{tag}</span>}
    </label>
  );
}

const toggled = (set: Set<string>, v: string) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

/**
 * Step 1. A controlled form (React 19 resets an uncontrolled `<form action>` after every action). Suggestions arrive
 * while the agency is already typing: new ones are merged in pre-ticked, never overwriting what is already chosen.
 */
export function BusinessStep({ view, profile, pending, onSave }: { view: ClientSetupView; profile: ProfileInitial; pending: boolean; onSave: (fd: FormData) => void }) {
  const ready = readySuggestions(view.suggestions);
  const waiting = view.suggestions.status === 'pending';
  const area = profile.serviceArea;
  const { lookup } = view;

  const [services, setServices] = useState(() => new Set([...profile.services, ...(ready?.services.map((s) => s.value) ?? [])]));
  const [keywords, setKeywords] = useState(() => new Set([...profile.keywords, ...(ready?.keywords.map((s) => s.value) ?? [])]));
  // 14a: Google services that match none of our areas. Unticked by default; hidden once saved (the area is then in the vertical's list).
  const known = new Set(view.vertical.services.map((v) => v.name.trim().toLowerCase()));
  const newAreas = (view.suggestions.status === 'ready' ? view.suggestions.newAreas : []).filter((a) => !known.has(a.name.trim().toLowerCase()));
  const [pickedNew, setPickedNew] = useState<Set<string>>(() => new Set());
  const [extra, setExtra] = useState('');
  const [center, setCenter] = useState(area ? `${area.center.lat}, ${area.center.lng}` : lookup ? `${lookup.lat}, ${lookup.lng}` : '');
  const [radius, setRadius] = useState(area ? String(area.radiusKm) : lookup ? DEFAULT_RADIUS_KM : '');
  const [zips, setZips] = useState(area?.zips.join(', ') ?? '');
  const [towns, setTowns] = useState(area?.towns?.length ? area.towns.join('\n') : (lookup?.city ?? ''));
  const [placeId, setPlaceId] = useState(profile.placeId ?? lookup?.placeId ?? '');

  // Suggestions that arrive after the form is shown: merge once, when the ready set first appears.
  const [merged, setMerged] = useState(ready !== null);
  if (ready && !merged) {
    setMerged(true);
    setServices((prev) => new Set([...prev, ...ready.services.map((s) => s.value)]));
    setKeywords((prev) => new Set([...prev, ...ready.keywords.map((s) => s.value)]));
  }

  const keywordChips = [...new Set([...((ready && ready.keywords.length > 0 ? ready.keywords.map((s) => s.value) : view.vertical.seedKeywords)), ...profile.keywords])];
  const quoteOf = new Map([...(ready?.services ?? []), ...(ready?.keywords ?? [])].map((s) => [s.value, s.quote]));
  const quotes = [...(ready?.services ?? []).map((s) => ({ ...s, label: view.vertical.services.find((v) => v.id === s.value)?.name ?? s.value })), ...(ready?.keywords ?? []).map((s) => ({ ...s, label: s.value }))];

  return (
    <form
      onReset={(e) => e.preventDefault()}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card"
    >
      {waiting && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">Reading your Google profile…</p>}
      {ready && (ready.services.length > 0 || ready.keywords.length > 0) && (
        <p className="text-sm text-muted-foreground">
          We pre-ticked what we found on the Google profile. Hover a chip to see where it came from, or see the list below.
        </p>
      )}
      {ready && ready.services.length === 0 && ready.keywords.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          We couldn&apos;t find suggestions in the Google profile — here are common keywords for {inSentence(view.vertical.name)}.
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Services the business offers</legend>
        <div className="flex flex-wrap gap-2">
          {view.vertical.services.map((s) => (
            <Chip key={s.id} name="services" value={s.id} label={s.name} checked={services.has(s.id)} onToggle={() => setServices((p) => toggled(p, s.id))} quote={quoteOf.get(s.id)} />
          ))}
          {newAreas.map((a) => (
            <Chip key={a.name} name="newAreas" value={a.name} label={a.name} tag="New" checked={pickedNew.has(a.name)} onToggle={() => setPickedNew((p) => toggled(p, a.name))} quote={a.quote} />
          ))}
        </div>
        {newAreas.length > 0 && <p className="text-sm text-muted-foreground">Not in our list yet. Tick to add it as a service; our team reviews new ones.</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Search keywords</legend>
        <div className="flex flex-wrap gap-2">
          {keywordChips.map((k) => (
            <Chip key={k} name="keywords" value={k} label={k} checked={keywords.has(k)} onToggle={() => setKeywords((p) => toggled(p, k))} quote={quoteOf.get(k)} />
          ))}
        </div>
        <Label htmlFor="extraKeywords">Add your own (one per line)</Label>
        <textarea id="extraKeywords" name="extraKeywords" value={extra} onChange={(e) => setExtra(e.target.value)} className={areaClass} />
        <p className="text-sm text-muted-foreground">Used for competitor discovery and local-ranking scans, e.g. “ac repair”.</p>
      </fieldset>

      {quotes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Where these came from</summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {quotes.map((q) => (
              <li key={`${q.label}-${q.quote}`}><span className="font-semibold text-ink">{q.label}</span> — From Google: “{q.quote}”</li>
            ))}
          </ul>
        </details>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Service area</legend>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="center">Map centre (latitude, longitude)</Label>
            <Input id="center" name="center" placeholder="33.95, -84.33" value={center} onChange={(e) => setCenter(e.target.value)} className="w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="radiusKm">Radius (km)</Label>
            <Input id="radiusKm" name="radiusKm" type="number" min={2} max={40} step="any" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} className="w-28" />
          </div>
        </div>
        <Label htmlFor="zips">ZIP codes served</Label>
        <textarea id="zips" name="zips" value={zips} onChange={(e) => setZips(e.target.value)} className={areaClass} />
        <Label htmlFor="towns">Towns served (one per line, optional)</Label>
        <textarea id="towns" name="towns" value={towns} onChange={(e) => setTowns(e.target.value)} className={areaClass} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="placeId">Google place id</Label>
        <Input id="placeId" name="placeId" value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="max-w-md" />
        <p className="text-sm text-muted-foreground">Lets us benchmark the business’s own reviews against its competitors.</p>
      </div>

      <WriteGuard>
        <Button type="submit" disabled={pending} className="self-start">Save and find competitors</Button>
      </WriteGuard>
    </form>
  );
}
