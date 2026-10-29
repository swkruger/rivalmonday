'use client';
import type { SetupLookup } from '@cs/db';
import { Button, ConfirmDialog, Label, nativeSelectClass } from '@cs/ui';
import { useState } from 'react';
import type { FormResult } from '@/server/forms';
import { assignBusinessAction, findPlacesAction } from './actions';
import { PlaceLookup } from './place-lookup';

export interface AssignAgency { id: string; name: string }

/**
 * Phase 17a: assign a confirmed waitlist business to an agency. The operator finds the Google listing (prefilled from the
 * entry), picks the agency (the operator's home agency first when it is in the list) and confirms. The result goes to
 * `onResult`, held by the always-mounted table so it survives the list refreshing.
 */
export function AssignDialog({ entryId, orgName, location, agencies, homeAgencyId, onResult }: {
  entryId: string;
  orgName: string;
  location: string | null;
  agencies: AssignAgency[];
  homeAgencyId: string | null;
  onResult: (r: FormResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<SetupLookup | null>(null);
  const [agencyId, setAgencyId] = useState(agencies.some((a) => a.id === homeAgencyId) ? (homeAgencyId ?? '') : '');
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button type="button" size="sm" onClick={() => { setError(null); setOpen(true); }}>Assign</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Assign ${orgName} to an agency`}
        body="Find the business's Google listing, then pick the agency. The agency is emailed and sees it under Leads."
        confirmLabel="Assign"
        initialFocus="first"
        disabled={!lookup || !agencyId}
        fields={{ id: entryId }}
        error={error ?? undefined}
        action={async (fd) => {
          const r = await assignBusinessAction({ ok: true }, fd);
          if (r.ok) {
            setOpen(false);
            onResult({ ok: true, message: `Assigned to ${agencies.find((a) => a.id === agencyId)?.name ?? 'the agency'}.` });
          } else setError(r.error);
        }}
      >
        <PlaceLookup initialName={orgName} initialLocation={location ?? ''} find={findPlacesAction} onPick={setLookup} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`assign-agency-${entryId}`}>Agency</Label>
          <select id={`assign-agency-${entryId}`} name="agencyId" required value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className={`${nativeSelectClass} max-w-xs`}>
            <option value="" disabled>Choose an agency</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </ConfirmDialog>
    </>
  );
}
