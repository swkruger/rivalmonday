'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const areaClass = 'min-h-20 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
    }
  | { mode: 'edit'; action: (prev: FormResult, fd: FormData) => Promise<FormResult>; verticals: VerticalOption[]; initial: Initial; clientId: string; timezoneOptions?: undefined; submitLabel?: undefined };

export function ClientProfileForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, { ok: true } as FormResult);
  const [verticalId, setVerticalId] = useState(props.initial?.verticalId ?? props.verticals[0]?.id ?? '');
  const services = props.verticals.find((v) => v.id === verticalId)?.services ?? [];
  const area = props.initial?.serviceArea ?? null;
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      {props.mode === 'edit' && <input type="hidden" name="clientId" value={props.clientId} />}
      {props.mode === 'edit' && <input type="hidden" name="verticalId" value={verticalId} />}
      {!state.ok && state.error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={props.initial?.name} className="max-w-sm" />
      </div>

      {props.mode === 'create' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="verticalId">Vertical</Label>
          <select id="verticalId" name="verticalId" value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={selectClass}>
            {props.verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Services the business offers</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input type="checkbox" name="services" value={s.id} defaultChecked={props.initial?.services.includes(s.id)} className="h-4 w-4" aria-label={s.name} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="keywords">Search keywords (one per line, up to 5)</Label>
        <textarea id="keywords" name="keywords" defaultValue={props.initial?.keywords.join('\n')} className={areaClass} />
        <p className="text-muted-foreground">Used for competitor discovery and local-ranking scans, e.g. “ac repair”.</p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Service area</legend>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="center">Map centre (latitude, longitude)</Label>
            <Input id="center" name="center" placeholder="33.95, -84.33" defaultValue={area ? `${area.center.lat}, ${area.center.lng}` : ''} className="w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="radiusKm">Radius (km)</Label>
            <Input id="radiusKm" name="radiusKm" inputMode="decimal" defaultValue={area ? String(area.radiusKm) : ''} className="w-28" />
          </div>
        </div>
        <p className="text-muted-foreground">In Google Maps, right-click the business location and click the coordinates to copy them.</p>
        <Label htmlFor="zips">ZIP codes served</Label>
        <textarea id="zips" name="zips" defaultValue={area?.zips.join(', ')} className={areaClass} />
        <Label htmlFor="towns">Towns served (one per line, optional)</Label>
        <textarea id="towns" name="towns" defaultValue={area?.towns?.join('\n')} className={areaClass} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="placeId">Google place id (optional)</Label>
        <Input id="placeId" name="placeId" defaultValue={props.initial?.placeId ?? ''} className="max-w-md" />
        <p className="text-muted-foreground">Lets Rival Monday benchmark the business’s own reviews against its competitors.</p>
      </div>

      {props.mode === 'create' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">Business time zone</Label>
          <select id="timezone" name="timezone" defaultValue="America/Chicago" className={selectClass}>
            {props.timezoneOptions.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      )}

      <Button type="submit" disabled={pending} className="self-start">{props.mode === 'create' ? (props.submitLabel ?? 'Create client') : 'Save profile'}</Button>
    </form>
  );
}
