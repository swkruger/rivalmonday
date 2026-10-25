'use client';
import { Button } from '@cs/ui';
import { useState } from 'react';
import { ActionDialog } from './[id]/action-dialog';
import { unarchiveFromListAction } from './agency-actions';

/** Owner-only row action in the Archived view. Same confirm copy as the detail page. */
export function UnarchiveRowButton({ agency }: { agency: { id: string; name: string } }) {
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
        action={unarchiveFromListAction}
      />
    </>
  );
}
