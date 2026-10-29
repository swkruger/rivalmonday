'use client';
import { BulkBar, bulkBarActionClass, Button, Input, Label, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow, Tag } from '@cs/ui';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ConfirmForm } from '@/components/confirm-form';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { formatDate } from '@/lib/format';
import { labelFor, SAMPLE_STAGE, SAMPLE_STATUS, WAITLIST_STATUS } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { AssignDialog, type AssignAgency } from './assign-dialog';
import { declineWaitlistEntryAction, inviteAgenciesAction, type InviteResult, stopSampleAction } from './actions';
import { SampleDialog } from './sample-dialog';

export type WaitlistTab = 'agencies' | 'businesses' | 'samples';

export interface WaitlistRow {
  id: string;
  kind: 'agency' | 'business';
  status: string;
  contactName: string;
  email: string;
  orgName: string;
  location: string | null;
  verticalId: string | null;
  verticalOther: string | null;
  clientCountBand: string | null;
  emailConfirmed: boolean;
  createdAt: string;
  sample: { businessName: string | null; location: string | null; website: string | null; status: string; stage: string | null; clientId: string | null } | null;
}

const dash = '—';

/** Detail column: agencies show their size band, businesses their type and place, samples the business asked for. */
function Detail({ row, tab, verticals }: { row: WaitlistRow; tab: WaitlistTab; verticals: Record<string, string> }) {
  const type = row.verticalOther ?? (row.verticalId ? (verticals[row.verticalId] ?? row.verticalId) : null);
  if (tab === 'samples' && row.sample) {
    return (
      <>
        <div className="text-ink">{row.sample.businessName ?? dash}</div>
        <div className="text-xs text-muted-ink">{[row.sample.location, row.sample.website].filter(Boolean).join(' · ')}</div>
      </>
    );
  }
  const parts = tab === 'businesses' ? [type, row.location] : [row.clientCountBand ? `${row.clientCountBand} clients` : null];
  return <div className="text-muted-ink">{parts.filter(Boolean).join(' · ') || dash}</div>;
}

/** Only a confirmed, still-new agency can be invited. */
const invitable = (r: WaitlistRow) => r.kind === 'agency' && r.status === 'new' && r.emailConfirmed;

const linkClass = 'text-sm font-medium text-primary-soft-text hover:underline';

/** Sample requests tab: Approve / Decline a confirmed request; Stop one in progress, with a link to where it stands. */
function SampleActions({ row, estimate, verticals }: { row: WaitlistRow; estimate: string; verticals: Record<string, string> }) {
  const s = row.sample;
  if (!s) return null;
  if (s.status === 'requested') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {row.emailConfirmed && (
          <SampleDialog
            entryId={row.id} orgName={row.orgName} contactName={row.contactName} businessName={s.businessName ?? row.orgName} location={s.location} website={s.website}
            estimate={estimate} verticals={Object.entries(verticals).map(([id, name]) => ({ id, name }))}
          />
        )}
        <ConfirmForm
          action={stopSampleAction} submit="Decline" variant="outline" title="Decline this sample request?" body="Nobody is emailed." confirmLabel="Decline" tone="danger"
          fields={{ id: row.id }} className="flex flex-wrap items-center gap-2"
        />
      </div>
    );
  }
  if (s.status !== 'approved') return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.stage === 'setup' && s.clientId && <Link href={`/c/${s.clientId}/setup`} className={linkClass}>Open setup</Link>}
      {s.stage === 'review' && <Link href="/agency/approvals" className={linkClass}>Review brief</Link>}
      <ConfirmForm
        action={stopSampleAction} submit="Stop" variant="outline" title="Stop this sample?" body="The business is paused and no link is sent." confirmLabel="Stop" tone="danger"
        fields={{ id: row.id }} className="flex flex-wrap items-center gap-2"
      />
    </div>
  );
}

/** The result lines live in the table component, which stays mounted, so they survive the list refreshing after an action. */
function InviteResultNote({ state }: { state: InviteResult }) {
  if (!state) return null;
  if (!state.ok) return <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>;
  return (
    <div role="status" className="flex flex-col gap-2 text-sm text-ink">
      <p>{state.message}</p>
      {state.failed.length > 0 && (
        <>
          <p>These emails failed — copy each link and send it yourself:</p>
          <ul className="flex flex-col gap-1">
            {state.failed.map((f) => (
              <li key={f.url}><span className="font-semibold">{f.orgName}</span> <span className="break-all font-mono text-xs">{f.url}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Phase 17a: the waitlist table. The Agencies tab selects confirmed new rows for a bulk invite; new rows on the Agencies and
 * Businesses tabs can be declined. New confirmed businesses can be assigned to an agency. Sample requests are approved, declined or
 * stopped here (Task 11 adds sending). `canWrite` is false for platform viewers.
 */
export function WaitlistTable({ rows, tab, tz, verticals, canWrite = false, agencies = [], homeAgencyId = null, sampleEstimate = '' }: {
  rows: WaitlistRow[]; tab: WaitlistTab; tz: string; verticals: Record<string, string>; canWrite?: boolean;
  /** Agencies a business can be assigned to (Businesses tab); the operator's home agency is the default pick. */
  agencies?: AssignAgency[]; homeAgencyId?: string | null;
  /** The Sample requests tab's cost line, repeated in the approve dialog. */
  sampleEstimate?: string;
}) {
  const [assigned, setAssigned] = useState<FormResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<InviteResult, FormData>(async (prev, fd) => {
    const r = await inviteAgenciesAction(prev, fd);
    if (r?.ok) setPicked(new Set());
    return r;
  }, null);
  const selectable = tab === 'agencies' && canWrite;
  // A row that stopped being invitable (just invited, refreshed away) drops out of the selection.
  const chosen = rows.filter((r) => picked.has(r.id) && invitable(r));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <div className="flex flex-col gap-3">
      <InviteResultNote state={state} />
      {assigned && (assigned.ok ? <p role="status" className="text-sm text-ink">{assigned.message}</p> : <ErrorNote compact focusKey={assigned}>{assigned.error}</ErrorNote>)}
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>}
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const status = tab === 'samples' && r.sample ? labelFor(SAMPLE_STATUS, r.sample.status) : labelFor(WAITLIST_STATUS, r.status);
              const stage = tab === 'samples' && r.sample?.stage ? labelFor(SAMPLE_STAGE, r.sample.stage) : null;
              return (
                <TableRow key={r.id}>
                  {selectable && (
                    <TableCell>
                      {invitable(r) && (
                        <input type="checkbox" className="size-4 accent-secondary" aria-label={`Select ${r.orgName}`} checked={picked.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="font-semibold text-ink">{r.orgName}</div>
                    <div className="text-xs text-muted-ink">{r.contactName}</div>
                  </TableCell>
                  <TableCell>
                    <div>{r.email}</div>
                    {!r.emailConfirmed && <Tag>Not confirmed</Tag>}
                  </TableCell>
                  <TableCell><Detail row={r} tab={tab} verticals={verticals} /></TableCell>
                  <TableCell>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    {stage && <div className="mt-1 text-xs text-muted-ink">{stage.label}</div>}
                  </TableCell>
                  <TableCell>{formatDate(r.createdAt, { tz })}</TableCell>
                  <TableCell>
                    {canWrite && tab !== 'samples' && r.status === 'new' && (
                      <ConfirmForm
                        action={declineWaitlistEntryAction}
                        submit="Decline"
                        variant="outline"
                        title={`Decline ${r.orgName}?`}
                        body="They are not emailed. A sample request from this entry is declined too."
                        confirmLabel="Decline"
                        tone="danger"
                        fields={{ id: r.id }}
                        className="flex flex-wrap items-center gap-2"
                      />
                    )}
                    {canWrite && tab === 'businesses' && r.status === 'new' && r.emailConfirmed && agencies.length > 0 && (
                      <AssignDialog entryId={r.id} orgName={r.orgName} location={r.location} agencies={agencies} homeAgencyId={homeAgencyId} onResult={setAssigned} />
                    )}
                    {canWrite && tab === 'samples' && <SampleActions row={r} estimate={sampleEstimate} verticals={verticals} />}
                    {/* Task 11: send sample */}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      {selectable && chosen.length > 0 && (
        <WriteGuard>
          <form action={formAction}>
            <BulkBar label="Selected agencies">
              <span>{chosen.length} selected</span>
              {chosen.map((r) => (
                <span key={r.id}>
                  <input type="hidden" name="ids" value={r.id} />
                  <input type="hidden" name={`org:${r.id}`} value={r.orgName} />
                </span>
              ))}
              <Label htmlFor="waitlist-pilot-ends" className="text-white">Pilot ends</Label>
              <Input id="waitlist-pilot-ends" name="pilotEndsAt" type="date" className="h-8 w-40 text-ink" />
              <Button type="submit" name="offer" value="pilot" size="sm" disabled={pending} className={bulkBarActionClass}>Send pilot invite</Button>
              <Button type="submit" name="offer" value="trial" size="sm" disabled={pending} className={bulkBarActionClass}>Send trial invite</Button>
            </BulkBar>
          </form>
        </WriteGuard>
      )}
    </div>
  );
}
