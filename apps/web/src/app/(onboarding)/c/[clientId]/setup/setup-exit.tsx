'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cs/ui';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useReadOnly } from '@/components/read-only';

/**
 * The top-right "Save and exit" menu of the client setup (spec 16 §6): leaving keeps everything done so far (the setup
 * resumes at its first open step from the client list), and "Dismiss setup…" hides the setup for good after a confirmation.
 * Dismissing is a write, so a read-only session only gets the exit.
 */
export function SetupExit({ exitHref = '/agency', onDismiss, pending }: { exitHref?: string; onDismiss: () => void; pending: boolean }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-13 font-medium text-muted-ink hover:text-ink">
            Save and exit <ChevronDown aria-hidden className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => router.push(exitHref)}>Save and exit</DropdownMenuItem>
          {!readOnly && <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>Dismiss setup…</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={(o) => { if (!pending) setConfirming(o); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Dismiss setup?</DialogTitle>
            <DialogDescription>Hide setup for this client? You can still edit everything in settings.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => { setConfirming(false); onDismiss(); }}>Dismiss setup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
