'use client';
import type { SetupLookup } from '@cs/db';
import { Button, ConfirmDialog, Label, nativeSelectClass } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approveSampleAction, findPlacesAction } from './actions';
import { PlaceLookup } from './place-lookup';

export interface VerticalOption { id: string; name: string }

/**
 * Phase 17a: approve a sample-brief request. The operator confirms the business's Google listing (prefilled from the request)
 * and its business type (preselected from the listing), then lands in the new sample client's setup.
 */
export function SampleDialog({ entryId, orgName, contactName, businessName, location, website, estimate, verticals }: {
  entryId: string;
  orgName: string;
  contactName: string;
  businessName: string;
  location: string | null;
  website: string | null;
  /** The page's "Estimated cost per sample" line. */
  estimate: string;
  verticals: VerticalOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<SetupLookup | null>(null);
  const [verticalId, setVerticalId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const known = (id: string | null | undefined) => (id && verticals.some((v) => v.id === id) ? id : '');

  return (
    <>
      <Button type="button" size="sm" onClick={() => { setError(null); setOpen(true); }}>Approve</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Build a sample brief for ${businessName}`}
        body="This creates the business in the Rival Monday Samples agency and opens its setup. Confirm the area and tick the rivals as usual, then approve the starting point in Approvals. Nothing is emailed to the business."
        confirmLabel="Approve and open setup"
        initialFocus="first"
        disabled={!lookup || !verticalId}
        fields={{ id: entryId }}
        error={error ?? undefined}
        action={async (fd) => {
          const r = await approveSampleAction(null, fd);
          if (r.ok) {
            setOpen(false);
            router.push(r.setupUrl);
          } else setError(r.error);
        }}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-ink">Requested by</dt>
          <dd className="text-ink">{orgName} ({contactName})</dd>
          <dt className="text-muted-ink">Business</dt>
          <dd className="text-ink">{[businessName, location, website].filter(Boolean).join(' · ')}</dd>
        </dl>
        <p className="text-sm text-muted-ink">{estimate}</p>
        <PlaceLookup
          initialName={businessName}
          initialLocation={location ?? ''}
          find={findPlacesAction}
          onPick={(l, place) => {
            setLookup(l);
            if (place) setVerticalId(known(place.suggestedVerticalId) || verticalId);
          }}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`sample-vertical-${entryId}`}>Business type</Label>
          <select id={`sample-vertical-${entryId}`} name="verticalId" required value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={`${nativeSelectClass} max-w-xs`}>
            <option value="" disabled>Choose a business type</option>
            {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </ConfirmDialog>
    </>
  );
}
