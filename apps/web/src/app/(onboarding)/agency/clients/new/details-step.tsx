'use client';
import { Button, Field, Input, fileInputClass } from '@cs/ui';
import { useEffect, useState } from 'react';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell, type OnboardingBrand } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { BriefCover, type CoverFocus } from '@/components/onboarding/previews/brief-cover';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { type ClientDraft, draftErrors, type DraftErrors, LOGO_MAX_BYTES, LOGO_TOO_LARGE } from './details-model';

export type FlowKind = 'client' | 'prospect';

/** `page:agency.clients.new` for a client, `page:agency.prospects.new` for a prospect (same screens, different page guide). */
const helpKeyFor = (kind: FlowKind) => (kind === 'prospect' ? 'agency.prospects.new' : 'agency.clients.new');

/** An object URL for a chosen file, revoked when the file changes or the step goes away. */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

const FOCUS: Partial<Record<keyof ClientDraft, CoverFocus>> = { name: 'business', contactName: 'contact', logo: 'logo' };

/** Step 1 (spec 16 §6): who the client is. Held in state until step 2 creates the client; nothing is saved by leaving. */
export function DetailsStep({ kind, brand, agencyName, steps, draft, onChange, onContinue, exitHref, guide }: {
  kind: FlowKind; brand: OnboardingBrand; agencyName: string; steps: number; draft: ClientDraft; onChange: (patch: Partial<ClientDraft>) => void;
  onContinue: () => void; exitHref: string; guide: boolean;
}) {
  const readOnly = useReadOnly();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const [focus, setFocus] = useState<CoverFocus>(null);
  const logoSrc = useObjectUrl(draft.logo);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = draftErrors(draft);
    setErrors(found);
    const first = (Object.keys(found) as (keyof DraftErrors)[])[0];
    if (first) { document.getElementById(first)?.focus(); return; }
    onContinue();
  };

  const field = (id: keyof DraftErrors, label: string, opts: { required?: boolean; optional?: boolean; hint?: string; input?: React.ComponentProps<typeof Input> } = {}) => (
    <Field label={label} required={opts.required} optional={opts.optional}
      error={errors[id] ? <span role="alert">{errors[id]}</span> : undefined} help={opts.hint}>
      <Input
        id={id} name={id} value={draft[id]} className={INPUT_CLASS} maxLength={200}
        {...(opts.required ? { 'aria-required': true } : {})}
        onChange={(e) => onChange({ [id]: e.target.value })}
        onFocus={() => setFocus(FOCUS[id] ?? null)} onBlur={() => setFocus(null)}
        {...opts.input}
      />
    </Field>
  );

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) { setLogoError(LOGO_TOO_LARGE); return; }
    setLogoError(null);
    onChange({ logo: file });
  };

  return (
    <OnboardingShell
      brand={brand}
      step={{ n: 1, of: steps, label: 'Client details' }}
      exit={{ href: exitHref, label: 'Exit' }}
      title={kind === 'prospect' ? 'Add a prospect' : 'Add a client'}
      subtitle="Who you're setting this up for. Only the starred fields are needed now."
      helpKey={`page:${helpKeyFor(kind)}`}
      guide={guide}
      preview={<PreviewWindow chrome={false} width={460}><BriefCover business={draft.name} contact={draft.contactName} agency={agencyName} logoSrc={logoSrc} focus={focus} /></PreviewWindow>}
      caption={<><b className="font-semibold">Live preview.</b> The top of every brief {draft.name.trim() || 'your client'} receives.</>}
      footer={<StepFooter primary={{ label: 'Continue', disabled: readOnly, form: 'details-form' }} />}
    >
      <form id="details-form" noValidate onSubmit={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="contents">
          {field('name', 'Business name', { required: true, input: { autoComplete: 'organization', maxLength: 120 } })}
          {field('contactName', 'Contact full name', { required: true, hint: "We'll suggest them as the owner to invite.", input: { autoComplete: 'off', maxLength: 120 } })}
          <div className="grid grid-cols-2 gap-3.5">
            {field('phone', 'Phone', { required: true, input: { type: 'tel', autoComplete: 'off', placeholder: '(404) 555-0100' } })}
            {field('email', 'Email', { required: true, input: { type: 'email', autoComplete: 'off' } })}
          </div>
          <div className="flex flex-col gap-3.5 border-t border-line pt-4">
            <p className="text-13 font-medium">Address <span className="font-normal text-muted-ink">(optional)</span></p>
            {field('line1', 'Street address')}
            <div className="grid grid-cols-[1fr_90px_110px] gap-2.5">
              {field('city', 'City')}
              {field('region', 'State')}
              {field('postalCode', 'ZIP code', { input: { inputMode: 'numeric' } })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <label htmlFor="logoFile" className="text-sm font-medium">Logo <span className="font-normal text-muted-ink">(optional)</span></label>
            <div className="flex items-center gap-3.5">
              {logoSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="The chosen logo" className="size-14 rounded-md border border-line object-contain" />
              )}
              <input
                id="logoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onFocus={() => setFocus('logo')} onBlur={() => setFocus(null)}
                onChange={(e) => pickLogo(e.target.files?.[0])}
                className={fileInputClass}
              />
              {draft.logo && <Button type="button" variant="ghost" size="sm" onClick={() => { onChange({ logo: null }); setLogoError(null); }}>Remove</Button>}
            </div>
            <p className={`text-13 ${logoError ? 'text-danger' : 'text-muted-ink'}`} role={logoError ? 'alert' : undefined}>{logoError ?? 'PNG, JPG or SVG, square, up to 512 KB.'}</p>
          </div>
        </fieldset>
      </form>
    </OnboardingShell>
  );
}
