'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import { FormError } from '@/components/form-error';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveProfileAction } from '../actions';
import { StepNav } from '../step-nav';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export interface ProfileValues {
  name: string; legalName: string | null; website: string | null; contactName: string; contactRole: string | null; contactEmail: string; phone: string;
  line1: string | null; line2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string; timezone: string;
  verticals: string[]; billingEmail?: string | null; billingSameAsPostal?: boolean; billingLine1?: string | null; billingLine2?: string | null;
  billingCity?: string | null; billingRegion?: string | null; billingPostalCode?: string | null; billingCountry?: string | null; taxId?: string | null;
}


function Field({ id, label, children, hint, required }: { id: string; label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {required && <p id={`${id}-required`} className="text-xs text-muted-foreground">Required</p>}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProfileStep({ initial, timezones, verticalChoices }: { initial: ProfileValues; timezones: string[]; verticalChoices: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(saveProfileAction, { ok: true } as FormResult);
  const [same, setSame] = useState(initial.billingSameAsPostal ?? true);
  // Controlled: React 19 resets uncontrolled fields after a form action, so a validation error would wipe what was typed.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(initial)) if (typeof v === 'string') o[k] = v;
    return o;
  });
  const [verticals, setVerticals] = useState<string[]>(initial.verticals);
  const readOnly = useReadOnly();
  const text = (id: keyof ProfileValues, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <Field id={id} label={label} required={extra.required === true || extra['aria-required'] === true || extra['aria-required'] === 'true'}>
      <Input id={id} name={id} value={vals[id] ?? ''} onChange={(e) => setVals((m) => ({ ...m, [id]: e.target.value }))} {...(extra.required || extra['aria-required'] ? { 'aria-required': true, 'aria-describedby': `${id}-required` } : {})} {...extra} />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-5 rounded-md border border-line bg-surface p-6">
        <p className="text-muted-foreground">We use this to set up your account and invoices. To save this step we need your agency name, a contact name, contact email and phone — everything else is optional. You can also skip and finish later.</p>
        <FormError state={state} />
        <fieldset disabled={readOnly} className="contents">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text('name', 'Agency name', { required: true, maxLength: 120 })}
            {text('legalName', 'Legal name', { maxLength: 200 })}
            {text('website', 'Website', { type: 'url', placeholder: 'https://example.com' })}
            {text('contactName', 'Contact name', { maxLength: 120, 'aria-required': true })}
            {text('contactRole', 'Contact role', { maxLength: 120 })}
            {text('contactEmail', 'Contact email', { type: 'email', 'aria-required': true })}
            {text('phone', 'Phone', { type: 'tel', placeholder: '(404) 555-0100', 'aria-required': true })}
            <Field id="timezone" label="Time zone">
              <select id="timezone" name="timezone" value={vals.timezone ?? initial.timezone} onChange={(e) => setVals((m) => ({ ...m, timezone: e.target.value }))} className={selectClass}>
                {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Industries you serve</legend>
            <div className="flex flex-wrap gap-4">
              {verticalChoices.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="verticals" value={v.id} checked={verticals.includes(v.id)} onChange={(e) => setVerticals((x) => (e.target.checked ? [...x, v.id] : x.filter((i) => i !== v.id)))} />
                  {v.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text('line1', 'Street address')}</div>
            {text('line2', 'Suite / unit')}
            {text('city', 'City')}
            {text('region', 'State')}
            {text('postalCode', 'ZIP code', { inputMode: 'numeric' })}
            <input type="hidden" name="country" value={initial.country} />
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <h2 className="text-base font-semibold">Billing</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {text('billingEmail', 'Billing email', { type: 'email' })}
              {text('taxId', 'Tax ID (optional)', { maxLength: 60 })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="billingSameAsPostal" checked={same} onChange={(e) => setSame(e.target.checked)} />
              Billing address same as postal
            </label>
            {!same && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field id="billingLine1" label="Billing street address">
                    <Input id="billingLine1" name="billingLine1" value={vals.billingLine1 ?? ''} onChange={(e) => setVals((m) => ({ ...m, billingLine1: e.target.value }))} />
                  </Field>
                </div>
                {text('billingLine2', 'Billing suite / unit')}
                {text('billingCity', 'Billing city')}
                {text('billingRegion', 'Billing state')}
                {text('billingPostalCode', 'Billing ZIP code', { inputMode: 'numeric' })}
                <input type="hidden" name="billingCountry" value={initial.billingCountry ?? initial.country} />
              </div>
            )}
          </div>
        </fieldset>
        <WriteGuard>
          <Button type="submit" disabled={pending} className="self-start">
            Save and continue
          </Button>
        </WriteGuard>
      </form>
      <StepNav step="profile" />
    </div>
  );
}
