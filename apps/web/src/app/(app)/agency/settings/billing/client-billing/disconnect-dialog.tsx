'use client';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@cs/ui';
import { useActionState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { disconnectAction } from './actions';

/** The trigger only opens the dialog; the disconnect runs from the confirm button alone. */
export function DisconnectDialog() {
  const [state, formAction, pending] = useActionState(disconnectAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <div className="flex flex-col gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="self-start">Disconnect Stripe</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Stripe?</DialogTitle>
            <DialogDescription>Your clients&apos; subscriptions keep running in your Stripe account, but Rival Monday will stop tracking payments.</DialogDescription>
          </DialogHeader>
          <form action={formAction}>
            <input type="hidden" name="confirm" value="yes" />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>Yes, disconnect</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!state.ok && <p role="alert" className="text-sm text-ink">{state.error}</p>}
    </div>
  );
}
