'use client';
import { Field, Input } from '@cs/ui';
import { useActionState, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { type BriefFocus, BriefFooter } from '@/components/onboarding/previews/brief-footer';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveBasicsAction } from '../actions';
import { STEP_LABELS, STEPS } from '../flow';

export interface AboutValues {
  name: string; contactName: string; phone: string; contactEmail: string;
  line1: string | null; line2: string | null; city: string | null; region: string | null; postalCode: string | null;
  billingSameAsPostal: boolean;
}

const FIELDS = ['name', 'contactName', 'phone', 'contactEmail', 'line1', 'line2', 'city', 'region', 'postalCode'] as const;
const FOCUS: Record<string, BriefFocus> = { name: 'agency', contactName: 'agency', phone: 'contact', contactEmail: 'contact', line1: 'address', line2: 'address', city: 'address', region: 'address', postalCode: 'address' };

/** Step 1 (spec 16 §5): the four required details, an optional address, a live "client brief footer" preview. */
export function AboutStep({ initial, guide }: { initial: AboutValues; guide: boolean }) {
  const [state, formAction, pending] = useActionState(saveBasicsAction, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  // Controlled: React 19 resets uncontrolled fields after a form action, so a validation error would wipe what was typed.
  const [vals, setVals] = useState<Record<(typeof FIELDS)[number], string>>(() => Object.fromEntries(FIELDS.map((k) => [k, initial[k] ?? ''])) as Record<(typeof FIELDS)[number], string>);
  const [same, setSame] = useState(initial.billingSameAsPostal);
  const [addressOpen, setAddressOpen] = useState(FIELDS.slice(4).some((k) => Boolean(initial[k])));
  const [focus, setFocus] = useState<BriefFocus>(null);
  const [timezone, setTimezone] = useState('');
  useEffect(() => { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);

  const input = (id: (typeof FIELDS)[number], label: string, extra: React.ComponentProps<typeof Input> = {}, opts: { required?: boolean } = {}) => (
    <Field label={label} required={opts.required}>
      <Input
        id={id} name={id} value={vals[id]} className={INPUT_CLASS} maxLength={200}
        onChange={(e) => setVals((v) => ({ ...v, [id]: e.target.value }))}
        onFocus={() => setFocus(FOCUS[id] ?? null)} onBlur={() => setFocus(null)}
        {...(opts.required ? { 'aria-required': true } : {})}
        {...extra}
      />
    </Field>
  );
  const cityLine = [vals.city, [vals.region, vals.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const address = [[vals.line1, vals.line2].filter(Boolean).join(', '), cityLine].filter(Boolean).join(', ');

  return (
    <OnboardingShell
      brand={{ kind: 'platform' }}
      step={{ n: 1, of: STEPS.length, label: STEP_LABELS.profile }}
      exit={{ href: '/agency', label: 'Save and exit' }}
      title="Welcome to Rival Monday"
      subtitle="The basics your clients will see. The rest can wait for Settings."
      helpKey="page:account.onboarding"
      guide={guide}
      preview={<PreviewWindow><BriefFooter agency={vals.name} contact={vals.contactName} phone={vals.phone} email={vals.contactEmail} address={address} focus={focus} /></PreviewWindow>}
      caption={<><b className="font-semibold">Live preview.</b> How you appear at the bottom of every client brief.</>}
      footer={<StepFooter primary={{ label: 'Continue', pending, disabled: readOnly, form: 'about-form' }} />}
    >
      <form id="about-form" action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <FormError state={state} />
        <input type="hidden" name="browserTimezone" value={timezone} />
        <fieldset disabled={readOnly} className="contents">
          {input('name', 'Agency name', { autoComplete: 'organization', maxLength: 120 }, { required: true })}
          <div className="grid grid-cols-2 gap-3.5">
            {input('contactName', 'Contact full name', { autoComplete: 'name', maxLength: 120 }, { required: true })}
            {input('phone', 'Phone', { type: 'tel', autoComplete: 'tel', placeholder: '(404) 555-0100' }, { required: true })}
          </div>
          {input('contactEmail', 'Email address', { type: 'email', autoComplete: 'email' }, { required: true })}
          {addressOpen ? (
            <div className="flex flex-col gap-3.5 border-t border-line pt-4">
              <p className="text-13 font-medium">Address <span className="font-normal text-muted-ink">(optional)</span></p>
              {input('line1', 'Street address')}
              {input('line2', 'Suite or unit')}
              <div className="grid grid-cols-[1fr_90px_110px] gap-2.5">
                {input('city', 'City')}
                {input('region', 'State')}
                {input('postalCode', 'ZIP code', { inputMode: 'numeric' })}
              </div>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" name="billingSameAsPostal" checked={same} onChange={(e) => setSame(e.target.checked)} />
                Use this for billing too
              </label>
              {!same && <p className="text-13 text-muted-ink">Add a separate billing address later in Settings, under Agency profile.</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setAddressOpen(true)} className="self-start text-sm font-medium text-secondary">+ Add an address</button>
          )}
        </fieldset>
        {/* A closed address block still posts the box, so "on" survives for a later address. */}
        {!addressOpen && same && <input type="hidden" name="billingSameAsPostal" value="on" />}
      </form>
    </OnboardingShell>
  );
}
