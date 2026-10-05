'use client';
import type { AgencyBranding } from '@cs/db';
import { resolveBranding } from '@cs/email/branding';
import { Button, Input, Label, themeVars } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { saveBrandingAction } from './actions';

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const picked = HEX.test(value) ? value : '#000000';
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={picked}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#47A8E7" className="w-32" />
      </div>
    </div>
  );
}

export function BrandingForm({ initial, agencyName }: { initial: AgencyBranding; agencyName: string }) {
  const [state, formAction, pending] = useActionState(saveBrandingAction, { ok: true } as FormResult);
  const [draft, setDraft] = useState<AgencyBranding>(initial);
  // Review Focus 5: the preview never reads raw form state directly — `resolveBranding` + `themeVars` validate every
  // colour and URL (6-digit hex, https) and fall back to the product defaults for anything else.
  const resolved = resolveBranding(agencyName, draft);
  const vars = themeVars(resolved) as React.CSSProperties;
  const set = (k: keyof AgencyBranding) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_360px]">
      <form action={formAction} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
        {!state.ok && state.error && (
          <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
            {state.error}
          </p>
        )}
        {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" value={draft.displayName ?? ''} onChange={(e) => set('displayName')(e.target.value)} placeholder={agencyName} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="logoUrl">Logo URL (https)</Label>
            <Input id="logoUrl" name="logoUrl" value={draft.logoUrl ?? ''} onChange={(e) => set('logoUrl')(e.target.value)} placeholder="https://example.com/logo.svg" />
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
        </div>
        <input type="hidden" name="primary" value={draft.primary ?? ''} />
        <input type="hidden" name="secondary" value={draft.secondary ?? ''} />
        <p className="text-sm text-muted-foreground">The amber accent is part of the product and can&apos;t be changed.</p>
        <Button type="submit" disabled={pending} className="self-start">
          Save changes
        </Button>
      </form>

      <div style={vars} className="sticky top-4 flex flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-card">
        <h2 className="text-base font-semibold">Live preview</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex h-[200px]">
            <div className="flex w-24 flex-col gap-1.5 border-r border-line bg-surface p-2 text-[11px]">
              {resolved.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolved.logoUrl} alt={resolved.displayName} className="h-5 w-auto" />
              ) : (
                <div className="truncate text-xs font-extrabold" style={{ color: 'var(--secondary)' }}>
                  {resolved.displayName}
                </div>
              )}
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
              <button type="button" className="mt-2 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--primary)' }}>
                Primary button
              </button>
              <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--primary-soft)', color: 'var(--primary-soft-text)' }}>
                Chip
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
