'use client';
import { Field, Input, SaveBar, Section, fileInputClass } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
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
  const start = {
    phone: initial.phone ?? '', line1: initial.address?.line1 ?? '', line2: initial.address?.line2 ?? '', city: initial.address?.city ?? '',
    region: initial.address?.region ?? '', postalCode: initial.address?.postalCode ?? '', contactName: initial.contactName ?? '', contactEmail: initial.contactEmail ?? '',
  };
  // `saved` is what Discard restores: the loaded values, then whatever the last successful save posted.
  const [saved, setSaved] = useState(start);
  const [v, setV] = useState(start);
  const logoRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) {
      setDirty(false);
      setSaved((cur) => Object.fromEntries(Object.keys(cur).map((k) => [k, String(fd.get(k) ?? '')])) as typeof cur);
    }
    return r;
  }, { ok: true } as FormResult);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV((cur) => ({ ...cur, [k]: e.target.value })); setDirty(true); };
  const discard = () => {
    setV(saved);
    if (logoRef.current) logoRef.current.value = '';
    setDirty(false);
  };
  const text = (k: keyof typeof v, label: string, o: { type?: string; className?: string; inputMode?: 'numeric' } = {}) => (
    <Field label={label}>
      <Input id={`details-${k}`} name={k} value={v[k]} onChange={set(k)} type={o.type} inputMode={o.inputMode} maxLength={200} className={o.className ?? 'max-w-md'} />
    </Field>
  );

  return (
    <form id="details" action={formAction} onReset={(e) => e.preventDefault()} aria-label="Business details" className="flex flex-col gap-5">
      <Section title="Business details" description="The phone, address and owner contact from setup. The phone also keeps the business out of its own competitor suggestions.">
        <input type="hidden" name="clientId" value={clientId} />
        <fieldset disabled={readOnly} className="contents">
          {text('phone', 'Phone', { type: 'tel' })}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">Address <span className="font-normal text-muted-ink">(optional)</span></legend>
            {text('line1', 'Street address')}
            {text('line2', 'Suite or unit (optional)')}
            <div className="grid max-w-md grid-cols-6 gap-3">
              <div className="col-span-3">{text('city', 'City', { className: 'w-full' })}</div>
              <div className="col-span-1">{text('region', 'State', { className: 'w-full' })}</div>
              <div className="col-span-2">{text('postalCode', 'ZIP code', { className: 'w-full', inputMode: 'numeric' })}</div>
            </div>
          </fieldset>
          <div className="flex flex-col gap-3">
            {text('contactName', 'Owner name')}
            {text('contactEmail', 'Owner email', { type: 'email' })}
          </div>
          <div className="flex items-start gap-3.5">
            {initial.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.logoUrl} alt="The current logo" className="size-14 rounded-md border border-line object-contain" />
            )}
            <Field label="Logo (optional)" help="PNG, JPG or SVG, square, up to 512 KB. Leave empty to keep the current logo.">
              <input
                id="details-logo" ref={logoRef} name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={() => setDirty(true)}
                className={fileInputClass}
              />
            </Field>
          </div>
        </fieldset>
      </Section>
      <FormError state={state} />
      {state.ok && !dirty && state.message && <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>}
      <WriteGuard>
        <SaveBar dirty={dirty} pending={pending} saveLabel="Save details" onReset={discard} />
      </WriteGuard>
    </form>
  );
}
