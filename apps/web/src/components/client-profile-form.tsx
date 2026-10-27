'use client';
import { Button, Field, Input, nativeSelectClass, SaveBar, Section, textareaClass } from '@cs/ui';
import { useActionState, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DEFAULT_RADIUS_KM, RadiusSelect } from '@/components/radius-select';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';

const selectClass = `${nativeSelectClass} w-full max-w-sm`;
const areaClass = `${textareaClass} max-w-xl`;

interface Initial {
  name: string;
  verticalId: string;
  services: string[];
  keywords: string[];
  placeId: string | null;
  serviceArea: { center: { lat: number; lng: number }; radiusKm: number; zips: string[]; towns?: string[] } | null;
}

type Props =
  | {
      mode: 'create'; action: (prev: FormResult, fd: FormData) => Promise<FormResult>; verticals: VerticalOption[]; timezoneOptions: string[];
      submitLabel?: string; initial?: undefined; clientId?: undefined;
      /** Agency admins get an Upgrade link on a seat-cap refusal. */
      canUpgrade?: boolean;
    }
  | { mode: 'edit'; action: (prev: FormResult, fd: FormData) => Promise<FormResult>; verticals: VerticalOption[]; initial: Initial; clientId: string; timezoneOptions?: undefined; submitLabel?: undefined; canUpgrade?: undefined };

export function ClientProfileForm(props: Props) {
  const area = props.initial?.serviceArea ?? null;
  const start = {
    name: props.initial?.name ?? '',
    services: props.initial?.services ?? [],
    keywords: props.initial?.keywords.join('\n') ?? '',
    center: area ? `${area.center.lat}, ${area.center.lng}` : '',
    radiusKm: area ? String(area.radiusKm) : DEFAULT_RADIUS_KM,
    zips: area?.zips.join(', ') ?? '',
    towns: area?.towns?.join('\n') ?? '',
    placeId: props.initial?.placeId ?? '',
  };
  // React 19 resets a form after every action, errors included. Every field is controlled (and onReset is blocked),
  // so a refused save keeps what was typed.
  const [name, setName] = useState(start.name);
  const [verticalId, setVerticalId] = useState(props.initial?.verticalId ?? props.verticals[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>(start.services);
  const [keywords, setKeywords] = useState(start.keywords);
  const [center, setCenter] = useState(start.center);
  const [radiusKm, setRadiusKm] = useState(start.radiusKm);
  const [zips, setZips] = useState(start.zips);
  const [towns, setTowns] = useState(start.towns);
  const [placeId, setPlaceId] = useState(start.placeId);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await props.action(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const services = props.verticals.find((v) => v.id === verticalId)?.services ?? [];
  const discard = () => {
    setName(start.name);
    setPicked(start.services);
    setKeywords(start.keywords);
    setCenter(start.center);
    setRadiusKm(start.radiusKm);
    setZips(start.zips);
    setTowns(start.towns);
    setPlaceId(start.placeId);
    setDirty(false);
  };
  return (
    <form
      action={formAction}
      onReset={(e) => e.preventDefault()}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-5"
    >
      {props.mode === 'edit' && <input type="hidden" name="clientId" value={props.clientId} />}
      {props.mode === 'edit' && <input type="hidden" name="verticalId" value={verticalId} />}

      <Section>
        <fieldset disabled={readOnly} className="contents">
          <Field label="Business name">
            <Input id="name" name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
          </Field>

          {props.mode === 'create' && (
            <Field label="Business type">
              <select id="verticalId" name="verticalId" value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={selectClass}>
                {props.verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Services the business offers</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox" name="services" value={s.id} checked={picked.includes(s.id)} className="h-4 w-4" aria-label={s.name}
                    onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Search keywords (one per line, up to 5)" help="Used for competitor discovery and local-ranking scans, e.g. “ac repair”.">
            <textarea id="keywords" name="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} className={areaClass} />
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">Service area</legend>
            <div className="flex flex-wrap gap-4">
              <Field label="Map centre (latitude, longitude)" help="In Google Maps, right-click the business location and click the coordinates to copy them.">
                <Input id="center" name="center" placeholder="33.95, -84.33" value={center} onChange={(e) => setCenter(e.target.value)} className="w-64" />
              </Field>
              <Field label="Service area radius">
                <RadiusSelect id="radiusKm" name="radiusKm" storedKm={area?.radiusKm ?? null} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
              </Field>
            </div>
            <Field label="ZIP codes served">
              <textarea id="zips" name="zips" value={zips} onChange={(e) => setZips(e.target.value)} className={areaClass} />
            </Field>
            <Field label="Towns served (one per line, optional)">
              <textarea id="towns" name="towns" value={towns} onChange={(e) => setTowns(e.target.value)} className={areaClass} />
            </Field>
          </fieldset>

          <Field label="Google Place ID (optional)" help="Lets us benchmark the business’s own reviews against its competitors.">
            <Input id="placeId" name="placeId" value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="max-w-md" />
          </Field>

          {props.mode === 'create' && (
            <Field label="Business time zone">
              <select id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectClass}>
                {props.timezoneOptions.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
          )}
        </fieldset>
      </Section>

      {/* The result sits at the end of the form, beside the Save control, not at the top. */}
      <FormError state={state} canUpgrade={props.mode === 'create' && props.canUpgrade === true} />
      {state.ok && !dirty && state.message && <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>}

      <WriteGuard>
        {props.mode === 'edit' ? (
          <SaveBar dirty={dirty} pending={pending} saveLabel="Save profile" onReset={discard} />
        ) : (
          <Button type="submit" disabled={pending} className="self-start">{props.submitLabel ?? 'Create client'}</Button>
        )}
      </WriteGuard>
    </form>
  );
}
