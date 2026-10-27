'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import { FormError } from '@/components/form-error';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

export interface ClientDetailsInitial {
  phone: string | null;
  address: { line1: string; line2?: string; city: string; region: string; postalCode: string; country: 'US' } | null;
  logoUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

/**
 * Final fix I3: the client's business details after setup (phone, address, owner contact, logo), agency staff only.
 * The phone also drives the self filter of the competitor search (P6), so a typo must be fixable here. Every field is
 * controlled and `onReset` is blocked (React 19 resets a form after every action), so a refused save keeps the typing.
 */
export function ClientDetailsForm({ clientId, initial, action }: {
  clientId: string; initial: ClientDetailsInitial; action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const readOnly = useReadOnly();
  const [v, setV] = useState({
    phone: initial.phone ?? '', line1: initial.address?.line1 ?? '', line2: initial.address?.line2 ?? '', city: initial.address?.city ?? '',
    region: initial.address?.region ?? '', postalCode: initial.address?.postalCode ?? '', contactName: initial.contactName ?? '', contactEmail: initial.contactEmail ?? '',
  });
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV((cur) => ({ ...cur, [k]: e.target.value })); setDirty(true); };
  const text = (k: keyof typeof v, label: string, o: { type?: string; className?: string; inputMode?: 'numeric' } = {}) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`details-${k}`}>{label}</Label>
      <Input id={`details-${k}`} name={k} value={v[k]} onChange={set(k)} type={o.type} inputMode={o.inputMode} maxLength={200} className={o.className ?? 'max-w-sm'} />
    </div>
  );

  return (
    <form id="details" action={formAction} onReset={(e) => e.preventDefault()} aria-labelledby="details-heading" className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      <div>
        <h2 id="details-heading" className="font-semibold">Business details</h2>
        <p className="text-muted-foreground">The phone, address and owner contact from setup. The phone also keeps the business out of its own competitor suggestions.</p>
      </div>
      <input type="hidden" name="clientId" value={clientId} />
      <fieldset disabled={readOnly} className="contents">
        {text('phone', 'Phone', { type: 'tel' })}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Address <span className="font-normal text-muted-foreground">(optional)</span></legend>
          {text('line1', 'Street address', { className: 'max-w-md' })}
          {text('line2', 'Suite or unit (optional)', { className: 'max-w-md' })}
          <div className="flex flex-wrap gap-3">
            {text('city', 'City', { className: 'w-48' })}
            {text('region', 'State', { className: 'w-24' })}
            {text('postalCode', 'ZIP code', { className: 'w-28', inputMode: 'numeric' })}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-4">
          {text('contactName', 'Owner name')}
          {text('contactEmail', 'Owner email', { type: 'email' })}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="details-logo">Logo (optional)</Label>
          <div className="flex items-center gap-3.5">
            {initial.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.logoUrl} alt="The current logo" className="size-14 rounded-lg border border-line object-contain" />
            )}
            <input
              id="details-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={() => setDirty(true)}
              className="text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-input file:bg-white file:px-3 file:text-sm file:font-medium"
            />
          </div>
          <p className="text-muted-foreground">PNG, JPG or SVG, square, up to 512 KB. Leave empty to keep the current logo.</p>
        </div>
      </fieldset>
      <FormError state={state} />
      {state.ok && !dirty && state.message && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
      <WriteGuard>
        <Button type="submit" disabled={pending} className="self-start">Save details</Button>
      </WriteGuard>
    </form>
  );
}
