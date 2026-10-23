'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@cs/ui';
import { useActionState, useCallback, useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveCostItemAction } from '../actions';
import { FormMessage, selectClass, useCloseOnSave } from './form-bits';
import type { CostItem } from './types';

/** Add (no `item`) or edit one manual cost. A one-off has no period or end date, so those fields are hidden for it. */
export function CostItemDialog({ item }: { item?: CostItem }) {
  const [state, formAction, pending] = useActionState(saveCostItemAction, { ok: true } as FormResult);
  const [kind, setKind] = useState<CostItem['kind']>(item?.kind ?? 'recurring');
  const resetKind = useCallback(() => setKind(item?.kind ?? 'recurring'), [item?.kind]);
  const { open, setOpen, formKey, shown } = useCloseOnSave(state, resetKind);
  const today = new Date().toISOString().slice(0, 10); // format-gate: value of a date input (yyyy-mm-dd)
  return (
    <WriteGuard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {item ? <Button variant="outline" size="sm" aria-label={`Edit ${item.name}`}>Edit</Button> : <Button>Add cost</Button>}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{item ? 'Edit cost' : 'Add cost'}</DialogTitle>
            <DialogDescription>A cost that has no API, like hosting or a domain.</DialogDescription>
          </DialogHeader>
          <form key={formKey} action={formAction} className="flex flex-col gap-3">
            <FormMessage state={shown} />
            {item && <input type="hidden" name="id" value={item.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-name">Name</Label>
              <Input id="ci-name" name="name" required maxLength={80} defaultValue={item?.name ?? ''} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-kind">Type</Label>
              <select id="ci-kind" name="kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as CostItem['kind'])}>
                <option value="recurring">Recurring</option>
                <option value="one_off">One-off</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-amount">Amount (USD)</Label>
              <Input id="ci-amount" name="amountUsd" inputMode="decimal" required defaultValue={item?.amountUsd ?? ''} />
            </div>
            {kind === 'recurring' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ci-period">Period</Label>
                <select id="ci-period" name="period" className={selectClass} defaultValue={item?.period ?? 'monthly'}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-starts">{kind === 'one_off' ? 'Date' : 'Starts on'}</Label>
              <Input id="ci-starts" name="startsOn" type="date" required defaultValue={item?.startsOn ?? today} />
            </div>
            {kind === 'recurring' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ci-ends">Ends on (optional)</Label>
                <Input id="ci-ends" name="endsOn" type="date" defaultValue={item?.endsOn ?? ''} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-url">Billing URL (optional)</Label>
              <Input id="ci-url" name="billingUrl" type="url" defaultValue={item?.billingUrl ?? ''} placeholder="https://" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ci-notes">Notes (optional)</Label>
              <Input id="ci-notes" name="notes" maxLength={500} defaultValue={item?.notes ?? ''} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </WriteGuard>
  );
}
