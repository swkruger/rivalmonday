'use client';
import type { AgencyBranding } from '@cs/db';
import { resolveBranding } from '@cs/email/branding';
import { Button, Input, Label, SaveBar, readableTextOn, themeVars } from '@cs/ui';
import { useActionState, useId, useRef, useState } from 'react';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange, note }: { label: string; value: string; onChange: (v: string) => void; note?: string }) {
  const picked = HEX.test(value) ? value : '#000000';
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={picked}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="#47A8E7" className="w-32" aria-describedby={note ? noteId : undefined} />
      </div>
      {note && <p id={noteId} className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

interface Props {
  initial: AgencyBranding;
  agencyName: string;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  submitLabel?: string;
  /** Rendered under the form (outside it), e.g. the wizard's Back / Skip controls. */
  footer?: React.ReactNode;
}

/** Shared by `/agency/settings/branding` and the onboarding wizard's branding step. */
export function BrandingEditor({ initial, agencyName, action, submitLabel = 'Save changes', footer }: Props) {
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) setSaved(draftRef.current);
    return r;
  }, { ok: true } as FormResult);
  const draftRef = useRef<AgencyBranding>(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgencyBranding>(initial);
  const [saved, setSaved] = useState<AgencyBranding>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const readOnly = useReadOnly();
  // Review Focus 5: the preview never reads raw form state directly — `resolveBranding` + `themeVars` validate every
  // colour and URL (6-digit hex, https) and fall back to the product defaults for anything else.
  const resolved = resolveBranding(agencyName, draft);
  const vars = themeVars(resolved) as React.CSSProperties;
  const logoSrc = previewLogo(resolved.logoUrl, draft.logoUrl);
  const set = (k: keyof AgencyBranding) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  draftRef.current = draft;
  const wizard = footer !== undefined; // the onboarding step keeps its own "Save and continue" button; the settings page gets the SaveBar

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
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-5 rounded-md border border-line bg-surface p-6">
        {!state.ok && state.error && (
          <ErrorNote focusKey={state}>
            {state.error}
          </ErrorNote>
        )}
        {state.ok && state.message && <p className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>}
        <fieldset disabled={readOnly} className="contents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" value={draft.displayName ?? ''} onChange={(e) => set('displayName')(e.target.value)} placeholder={agencyName} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="logoUrl">Logo URL (https)</Label>
            <Input id="logoUrl" name="logoUrl" value={draft.logoUrl ?? ''} onChange={(e) => set('logoUrl')(e.target.value)} placeholder="https://example.com/logo.svg" />
          </div>
          <p className="text-sm font-semibold text-ink sm:col-span-2">or</p>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="logoFile">Upload logo</Label>
            <input
              id="logoFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
            />
            <p className="text-sm text-muted-foreground">PNG, JPEG, WebP or SVG, up to 512 KB. It is resized to fit 512 × 512. {uploading ? 'Uploading…' : ''}</p>
            {uploadError && <ErrorNote>{uploadError}</ErrorNote>}
          </div>
          <ColorField label="Primary colour" value={draft.primary ?? ''} onChange={set('primary')} />
          <ColorField label="Secondary colour" value={draft.secondary ?? ''} onChange={set('secondary')} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="fromName">Email from-name</Label>
            <Input id="fromName" name="fromName" value={draft.fromName ?? ''} onChange={(e) => set('fromName')(e.target.value)} placeholder={agencyName} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="signOff">Email sign-off</Label>
            <Input id="signOff" name="signOff" value={draft.signOff ?? ''} onChange={(e) => set('signOff')(e.target.value)} placeholder="Questions? Reply to this email." />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="assistantName">Assistant name</Label>
            <Input id="assistantName" name="assistantName" maxLength={30} value={draft.assistantName ?? ''} onChange={(e) => set('assistantName')(e.target.value)} placeholder="Friday" />
            <p className="text-sm text-muted-foreground">What your clients call the Ask assistant. Leave blank for Friday.</p>
          </div>
        </div>
        </fieldset>
        <input type="hidden" name="primary" value={draft.primary ?? ''} />
        <input type="hidden" name="secondary" value={draft.secondary ?? ''} />
        <p className="text-sm text-muted-foreground">The amber accent is part of the product and can&apos;t be changed.</p>
        {wizard ? (
          <WriteGuard>
            <Button type="submit" disabled={pending} className="self-start">
              {submitLabel}
            </Button>
          </WriteGuard>
        ) : (
          !readOnly && (
            <SaveBar
              dirty={dirty}
              pending={pending}
              saveLabel={submitLabel}
              onReset={() => setDraft(saved)}
            />
          )
        )}
      </form>
      {footer}
      </div>

      <div style={vars} className="sticky top-4 flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Live preview</h2>
        <p className="text-xs font-semibold text-muted-foreground">Dashboard</p>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex h-[200px]">
            <div className="flex w-24 flex-col gap-1.5 border-r border-line bg-surface p-2 text-[11px]">
              <div data-testid="preview-dashboard-header">
                <Mark logoUrl={logoSrc} name={resolved.displayName} className="h-5 w-auto" textClass="truncate text-xs font-bold" />
              </div>
              <div className="mt-1 rounded px-1.5 py-1 font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary-soft-text)' }}>
                Overview
              </div>
              <div className="px-1.5 py-1">Clients</div>
            </div>
            <div className="flex-1 bg-canvas p-2.5">
              <div
                className="rounded-md border-l-[3px] bg-white p-2 text-[11px]"
                style={{ borderLeftColor: 'var(--primary)' }}
              >
                <span className="font-semibold">A competitor move worth your attention</span>
              </div>
              <button type="button" className="mt-2 rounded-sm px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Primary button
              </button>
              <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary-soft-text)' }}>
                Chip
              </span>
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">Email</p>
        <div className="overflow-hidden rounded-xl border border-line" style={{ background: resolved.canvas }}>
          <div className="p-3">
            <div data-testid="preview-email-header" className="pb-2">
              <Mark logoUrl={logoSrc} name={resolved.displayName} className="h-6 w-auto" textClass="text-base font-bold" />
            </div>
            <div className="rounded-lg bg-white p-3 text-[11px]">
              <p>Hi Sam,</p>
              <p className="mt-1">Your weekly competitor brief is ready.</p>
              <span className="mt-2 inline-block rounded-sm px-3 py-1.5 text-xs font-semibold" style={{ background: resolved.primary, color: readableTextOn(resolved.primary) }}>
                View the brief
              </span>
              {resolved.signOff && <p className="mt-2 text-muted-foreground">{resolved.signOff}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mark({ logoUrl, name, className, textClass }: { logoUrl: string | null; name: string; className: string; textClass: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={className} />;
  }
  return (
    <div className={textClass} style={{ color: 'var(--secondary)' }}>
      {name}
    </div>
  );
}

/** Dev only: an uploaded logo is served over plain http by this deployment; preview it by path (the stored value is validated server-side). */
export function previewLogo(resolvedLogo: string | null, draftLogo: string | undefined): string | null {
  if (resolvedLogo) return resolvedLogo;
  try {
    const u = new URL(draftLogo ?? '');
    return u.protocol === 'http:' && /^\/files\/logo\/[0-9a-f-]+\/[0-9a-f]{64}\.png$/.test(u.pathname) ? u.pathname : null;
  } catch {
    return null;
  }
}
