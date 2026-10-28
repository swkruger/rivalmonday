'use client';
import type { AgencyBranding } from '@cs/db';
import { resolveBranding } from '@cs/email/branding';
import { Field, Input } from '@cs/ui';
import { useActionState, useState } from 'react';
import { ErrorNote, FormError } from '@/components/form-error';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { type BrandFocus, BrandedDashboard } from '@/components/onboarding/previews/branded-dashboard';
import { StepFooter } from '@/components/onboarding/step-footer';
import { previewLogo } from '@/components/agency/branding-editor';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveBrandingStepAction } from '../actions';
import { prevPath, STEP_LABELS, STEPS } from '../flow';
import { useSkip } from './use-skip';

const SWATCHES = ['#163A5F', '#0F7B6C', '#B4235A', '#E2711D'] as const;

/** Step 3 (spec 16 §5): logo upload, colour and the name clients see, over the client dashboard in those colours. */
export function BrandStep({ initial, agencyName, guide }: { initial: AgencyBranding; agencyName: string; guide: boolean }) {
  const [state, formAction, pending] = useActionState(saveBrandingStepAction, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const { skip, skipping } = useSkip('branding');
  const [draft, setDraft] = useState<AgencyBranding>(initial);
  const [focus, setFocus] = useState<BrandFocus>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = (k: keyof AgencyBranding) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  // The preview never reads raw form state: `resolveBranding` validates every colour and URL and falls back to the defaults.
  const resolved = resolveBranding(agencyName, draft);
  const logoSrc = previewLogo(resolved.logoUrl, draft.logoUrl);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/agency/settings/branding/logo', { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { logoUrl?: string; message?: string } | null;
      if (res.ok && json?.logoUrl) set('logoUrl')(json.logoUrl);
      else setUploadError(json?.message ?? "That logo couldn't be uploaded. Try a different file.");
    } catch {
      setUploadError("That logo couldn't be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <OnboardingShell
      brand={{ kind: 'platform' }}
      step={{ n: 3, of: STEPS.length, label: STEP_LABELS.branding }}
      exit={{ href: '/agency', label: 'Save and exit' }}
      title="Put your brand on it"
      subtitle="Your clients see your logo, colours and name, not ours."
      helpKey="page:account.onboarding"
      guide={guide}
      preview={<PreviewWindow chrome="Your client's dashboard" width={680}><BrandedDashboard name={resolved.displayName} logoSrc={logoSrc} color={resolved.primary} focus={focus} /></PreviewWindow>}
      caption={<><b className="font-semibold">Live preview.</b> Your client&apos;s dashboard with your logo and colours.</>}
      footer={
        <StepFooter
          back={prevPath('branding')!}
          skip={{ label: 'Skip for now', onSkip: () => { if (!readOnly && !skipping) skip(); }, disabled: readOnly || skipping }}
          primary={{ label: 'Continue', pending, disabled: readOnly || uploading, form: 'brand-form' }}
        />
      }
    >
      <form id="brand-form" action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-5">
        <FormError state={state} />
        <input type="hidden" name="logoUrl" value={draft.logoUrl ?? ''} />
        <input type="hidden" name="primary" value={draft.primary ?? ''} />
        <fieldset disabled={readOnly} className="contents">
          <Field htmlFor="logoFile" label="Agency logo" optional help="PNG, JPEG, WebP or SVG, up to 512 KB. It is resized to fit.">
            <>
            <div className="flex items-center gap-3.5">
              {logoSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Your logo" className="size-14 rounded-md border border-line object-contain" />
              )}
              <input
                id="logoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading}
                onFocus={() => setFocus('logo')} onBlur={() => setFocus(null)}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
              />
              {uploading && <span className="text-[13px] text-muted-ink" role="status">Uploading…</span>}
            </div>
            {uploadError && <ErrorNote>{uploadError}</ErrorNote>}
            </>
          </Field>
          <Field htmlFor="primaryHex" label="Brand colour" optional help="We keep text readable on any colour.">
            <div role="group" aria-label="Brand colour" className="flex flex-wrap items-center gap-2.5">
              {SWATCHES.map((c) => (
                <button
                  key={c} type="button" aria-label={`Use ${c}`} aria-pressed={draft.primary?.toLowerCase() === c.toLowerCase()}
                  onClick={() => set('primary')(c)} onFocus={() => setFocus('color')} onBlur={() => setFocus(null)}
                  className="size-8 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary" style={{ background: c }}
                />
              ))}
              <Input id="primaryHex" value={draft.primary ?? ''} placeholder="#47A8E7" className={`${INPUT_CLASS} ml-1.5 w-32`} onChange={(e) => set('primary')(e.target.value)} onFocus={() => setFocus('color')} onBlur={() => setFocus(null)} />
            </div>
          </Field>
          <Field label="Name your clients see" optional>
            <Input id="displayName" name="displayName" className={INPUT_CLASS} maxLength={120} value={draft.displayName ?? ''} placeholder={agencyName}
              onChange={(e) => set('displayName')(e.target.value)} onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} />
          </Field>
        </fieldset>
      </form>
    </OnboardingShell>
  );
}
