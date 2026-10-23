'use client';
import { Button, ConfirmDialog } from '@cs/ui';
import { useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { disconnectAction } from './actions';
import { ErrorNote } from '@/components/form-error';

/** The trigger only opens the dialog; the disconnect runs from the confirm button alone. The result stays mounted here (it survives the dialog closing and the revalidate). */
export function DisconnectDialog() {
  const [state, setState] = useState<FormResult>({ ok: true });
  return (
    <WriteGuard>
      <div className="flex flex-col gap-2 self-start">
        <ConfirmDialog
          trigger={<Button type="button" variant="outline" className="self-start">Disconnect Stripe</Button>}
          title="Disconnect Stripe?"
          body="Your clients' subscriptions keep running in your Stripe account, but Rival Monday will stop tracking payments."
          confirmLabel="Yes, disconnect"
          tone="danger"
          fields={{ confirm: 'yes' }}
          action={async (fd) => setState(await disconnectAction(state, fd))}
        />
        {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
      </div>
    </WriteGuard>
  );
}
