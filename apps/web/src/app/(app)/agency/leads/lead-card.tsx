'use client';
import { Button, Card, CardContent, StatusChip } from '@cs/ui';
import { useActionState, useState } from 'react';
import { NewBusinessType, type VerticalActions, useVerticalChoice } from '@/components/new-business-type';
import { WriteGuard } from '@/components/read-only';
import { formatDate } from '@/lib/format';
import { LEAD_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';
import { acceptLeadAction, declineLeadAction } from './actions';
import { ErrorNote } from '@/components/form-error';

export type LeadPreview =
  | { status: 'none' | 'pending' | 'failed' }
  | { status: 'ready'; facts: string[]; summary: string | null };

export interface LeadView {
  id: string;
  source: 'agency_link' | 'platform';
  status: 'verified' | 'accepted' | 'declined';
  ref: string | null;
  businessName: string;
  address: string | null;
  contactName: string;
  email: string;
  phone: string | null;
  message: string | null;
  preview: LeadPreview;
  clientId: string | null;
  /** ISO date of the decision (accepted/declined tabs) or of verification (New). */
  when: string;
  suggestedVerticalId: string | null;
  /** The Google listing, for the "new business type" panel when nothing matched. */
  lookup?: { placeId: string; category: string | null };
}

/** Shown instead of the "Let them know" checkbox: a declined platform lead returns to the pool and the visitor is not emailed. */
export const PLATFORM_NOTE = 'This lead goes back to the pool.';
const fieldCls = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** "From your website" for the agency's own intake link; a lead the platform assigned is "From the platform" (agency pages never name Rival Monday). */
export function sourceLabel(source: LeadView['source']): string {
  return source === 'agency_link' ? 'From your website' : 'From the platform';
}

function Preview({ preview }: { preview: LeadPreview }) {
  if (preview.status === 'pending') return <p className="text-sm text-muted-foreground">Snapshot is being built…</p>;
  if (preview.status !== 'ready') return null;
  return (
    <div className="rounded-md bg-muted-surface p-3 text-sm text-ink">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-ink">Snapshot</p>
      {preview.facts.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {preview.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {preview.summary && <p className="mt-1">{preview.summary}</p>}
    </div>
  );
}

function AcceptForm({ lead, verticals, verticalActions, onCancel }: { lead: LeadView; verticals: VerticalOption[]; verticalActions?: VerticalActions; onCancel: () => void }) {
  const [state, action, pending] = useActionState(acceptLeadAction, { ok: true } as FormResult);
  const choice = useVerticalChoice(verticals, lead.suggestedVerticalId ?? verticals[0]?.id ?? '');
  const { value: verticalId, options } = choice;
  return (
    <div className="flex flex-col gap-3">
      {verticalActions && lead.lookup && lead.suggestedVerticalId === null && (
        <NewBusinessType place={{ ...lead.lookup, businessName: lead.businessName }} actions={verticalActions} onSelect={choice.choose} onCreated={choice.choose} />
      )}
    <form action={action} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="leadId" value={lead.id} />
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={`v-${lead.id}`} className="font-medium">Business type</label>
        <select id={`v-${lead.id}`} name="verticalId" value={verticalId} onChange={(e) => choice.choose(e.target.value)} className={fieldCls}>
          {options.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>Accept and invite {lead.contactName}</Button>
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      {!state.ok && <ErrorNote compact focusKey={state} className="basis-full">{state.error}</ErrorNote>}
    </form>
    </div>
  );
}

function DeclineForm({ lead, onCancel }: { lead: LeadView; onCancel: () => void }) {
  const [state, action, pending] = useActionState(declineLeadAction, { ok: true } as FormResult);
  const platform = lead.source === 'platform';
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="leadId" value={lead.id} />
      {platform ? (
        <p className="text-sm text-muted-foreground">{PLATFORM_NOTE}</p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked /> Let them know
        </label>
      )}
      <Button type="submit" variant="outline" disabled={pending}>Decline</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      {!state.ok && <ErrorNote compact focusKey={state} className="basis-full">{state.error}</ErrorNote>}
    </form>
  );
}

/** `tz` is the viewer's zone and `nowMs` the page's clock (so the year shown agrees between server and browser). */
export function LeadCard({ lead, verticals, verticalActions, tz = 'UTC', nowMs }: { lead: LeadView; verticals: VerticalOption[]; verticalActions?: VerticalActions; tz?: string; nowMs?: number }) {
  const [mode, setMode] = useState<'accept' | 'decline' | null>(null);
  const date = formatDate(lead.when, { tz, ...(nowMs !== undefined ? { now: new Date(nowMs) } : {}) });
  const status = labelFor(LEAD_STATUS, lead.status);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{lead.businessName}</h2>
            {lead.address && <p className="text-sm text-muted-foreground">{lead.address}</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            <span className="text-xs text-muted-foreground">{sourceLabel(lead.source)}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
        </div>
        <p className="text-sm">
          <span className="font-semibold">{lead.contactName}</span> · <a href={`mailto:${lead.email}`} className="text-primary-soft-text">{lead.email}</a>
          {lead.phone ? ` · ${lead.phone}` : ''}
          {lead.ref ? <span className="text-muted-foreground"> · Ref {lead.ref}</span> : null}
        </p>
        {lead.message && <p className="whitespace-pre-wrap border-l-2 border-line pl-3 text-sm">{lead.message}</p>}
        <Preview preview={lead.preview} />
        {lead.status === 'verified' && (
          <WriteGuard>
            {mode === null ? (
              <div className="flex gap-2">
                <Button onClick={() => setMode('accept')}>Accept</Button>
                <Button variant="outline" onClick={() => setMode('decline')}>Decline</Button>
              </div>
            ) : mode === 'accept' ? (
              <AcceptForm lead={lead} verticals={verticals} verticalActions={verticalActions} onCancel={() => setMode(null)} />
            ) : (
              <DeclineForm lead={lead} onCancel={() => setMode(null)} />
            )}
          </WriteGuard>
        )}
        {lead.status === 'accepted' && lead.clientId && (
          <a href={`/c/${lead.clientId}/setup`} className="text-sm font-semibold text-primary-soft-text">Open setup</a>
        )}
      </CardContent>
    </Card>
  );
}
