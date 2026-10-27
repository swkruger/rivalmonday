'use client';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label } from '@cs/ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog, ResultLine } from './action-dialog';
import { MoveLines, moveSummary, type PlanAgencyRow } from '../../_components/plan-move-parts';
import { archiveAgencyAction, moveAgencyToCurrentPlanAction, renameAgencyAction, suspendAgencyAction, unarchiveAgencyAction, unsuspendAgencyAction } from './actions';

type Agency = { id: string; name: string };
type Open = 'rename' | 'hold' | 'lift' | 'archive' | 'move' | null;
/** Present only when the agency is behind the current plan version and can be moved now (not on hold, archived or cancelled). */
export type PlanMove = { row: PlanAgencyRow; currentVersion: number };

const REASON_MIN = 3;
const REASON_MAX = 500;
const textareaCls = 'w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Spec §4.5 / mockup pages 2, 5, 6, 8: the header's Manage menu (platform staff and owners; the page renders none for
 * viewers). Rename and hold/lift for staff+; owners also get Move to current plan (when `planMove` is set) and Archive. `archiveRefusal` is the
 * page's live-billing sentence (R1: from `get_platform_agency.archiveBlockers`); the tool re-checks on confirm.
 */
export function ManageMenu({ agency, role, held, archiveRefusal, planMove = null }: { agency: Agency; role: 'owner' | 'staff'; held: boolean; archiveRefusal: string | null; planMove?: PlanMove | null }) {
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState(agency.name);
  const [reason, setReason] = useState('');
  const show = (o: Open) => {
    setMessage(null);
    if (o === 'rename') setName(agency.name);
    if (o === 'hold') setReason('');
    setOpen(o);
  };
  const dialog = (o: Exclude<Open, null>) => ({ open: open === o, onOpenChange: (v: boolean) => setOpen(v ? o : null), fields: { agencyId: agency.id }, onDone: (m: string | undefined) => setMessage(m ?? null) });
  const reasonLength = [...reason.trim()].length;

  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">Manage <ChevronDown aria-hidden="true" className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => show('rename')}>Rename agency</DropdownMenuItem>
          {held
            ? <DropdownMenuItem onSelect={() => show('lift')}>Lift hold</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => show('hold')}>Put on hold</DropdownMenuItem>}
          {role === 'owner' && planMove && <DropdownMenuItem onSelect={() => show('move')}>Move to current plan</DropdownMenuItem>}
          {role === 'owner' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => show('archive')}>Archive agency</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResultLine message={message} className="max-w-md text-right text-sm text-ink" />

      <ActionDialog {...dialog('rename')} title="Rename agency" confirmLabel="Rename" action={renameAgencyAction} canSubmit={name.trim().length > 0}>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-agency-name">Agency name</Label>
          <Input id="rename-agency-name" name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </ActionDialog>

      <ActionDialog
        {...dialog('hold')}
        title={`Put ${agency.name} on hold?`}
        body={
          <>
            <p>While on hold:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Its team can sign in and see everything, but can&apos;t change anything.</li>
              <li>Scheduled work stops: no collection, briefs or alerts.</li>
              <li>Billing pauses on its plan and on its clients&apos; subscriptions. Invoices during the hold aren&apos;t charged later.</li>
              <li>Its agency admins get an email saying the account is on hold.</li>
            </ul>
          </>
        }
        confirmLabel="Put on hold"
        tone="danger"
        canSubmit={reasonLength >= REASON_MIN && reasonLength <= REASON_MAX}
        action={suspendAgencyAction}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="hold-reason">Reason (staff only)</Label>
          <textarea id="hold-reason" name="reason" rows={3} required minLength={REASON_MIN} maxLength={REASON_MAX} aria-describedby="hold-reason-hint" value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          <p id="hold-reason-hint" className="text-xs text-muted-foreground">Never shown to the agency. 3–500 characters.</p>
        </div>
      </ActionDialog>

      <ActionDialog
        {...dialog('lift')}
        title={`Lift the hold on ${agency.name}?`}
        body="Changes, scheduled work and billing resume now, and its admins get an email."
        confirmLabel="Lift hold"
        action={unsuspendAgencyAction}
      />

      {role === 'owner' && planMove && (
        <ActionDialog
          {...dialog('move')}
          title={`Move ${agency.name} to v${planMove.currentVersion}?`}
          body={<MoveLines rows={[planMove.row]} targetVersion={planMove.currentVersion} />}
          confirmLabel={`Move to v${planMove.currentVersion}`}
          action={async () => {
            const r = await moveAgencyToCurrentPlanAction(agency.id);
            if (!r.ok) return r;
            const text = moveSummary(r.data, () => agency.name);
            return r.data.results.some((x) => x.outcome === 'refused' || x.outcome === 'failed') ? { ok: false, error: text } : { ok: true, message: text };
          }}
        />
      )}

      {role === 'owner' && (
        <ActionDialog
          {...dialog('archive')}
          title={`Archive ${agency.name}?`}
          body="The agency, its team and its clients disappear for everyone outside the platform. Nothing is deleted: evidence stays, and an owner can unarchive it from the Archived filter. After 30 days it can be purged."
          confirmLabel="Archive agency"
          tone="danger"
          {...(archiveRefusal ? { refusal: archiveRefusal } : { requireText: agency.name })}
          action={archiveAgencyAction}
        />
      )}
    </div>
  );
}

/** Archived detail (owner only): brings the agency back; the page then renders its normal view. */
export function UnarchiveButton({ agency }: { agency: Agency }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>Unarchive</Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        fields={{ agencyId: agency.id }}
        title={`Unarchive ${agency.name}?`}
        body="The agency and its clients come back as they were. Paused billing doesn't restart on its own."
        confirmLabel="Unarchive"
        action={unarchiveAgencyAction}
      />
    </>
  );
}
