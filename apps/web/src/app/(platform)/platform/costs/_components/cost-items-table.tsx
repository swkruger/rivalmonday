'use client';
import { formatDate, formatMoney } from '@/lib/format';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState } from 'react';
import { HelpEmpty } from '@/components/help/empty-state';
import { useReadOnly, WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { archiveCostItemAction } from '../actions';
import { CostItemDialog } from './cost-item-dialog';
import { FormMessage } from './form-bits';
import type { CostItem } from './types';

const TYPE_LABEL = { monthly: 'Monthly', yearly: 'Yearly', one_off: 'One-off' } as const;
const typeOf = (i: CostItem) => (i.kind === 'one_off' ? TYPE_LABEL.one_off : TYPE_LABEL[i.period ?? 'monthly']);
const day = (v: string) => formatDate(v, { tz: 'UTC' }); // date-only columns: the calendar day, never shifted
const dates = (i: CostItem) => (i.kind === 'one_off' ? day(i.startsOn) : `${day(i.startsOn)} → ${i.endsOn ? day(i.endsOn) : 'ongoing'}`);

function ArchiveButton({ item }: { item: CostItem }) {
  const [state, formAction, pending] = useActionState(archiveCostItemAction, { ok: true } as FormResult);
  return (
    <WriteGuard>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Archive ${item.name}`}>Archive</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {item.name}?</DialogTitle>
            <DialogDescription>It stays in past months’ totals.</DialogDescription>
          </DialogHeader>
          <FormMessage state={state} />
          <form action={formAction}>
            <input type="hidden" name="id" value={item.id} />
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={pending}>Archive</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </WriteGuard>
  );
}

/** Manual costs. The Actions column is dropped in a read-only session (nothing to put in it). */
export function CostItemsTable({ items }: { items: CostItem[] }) {
  const readOnly = useReadOnly();
  if (items.length === 0) return <HelpEmpty id="platform.costs.manual" guideAnchor="common-questions" />;
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Per month</TableHead>
            <TableHead>Dates</TableHead>
            {!readOnly && <TableHead><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-medium">
                {i.billingUrl ? <a href={i.billingUrl} target="_blank" rel="noopener noreferrer" className="underline">{i.name}</a> : i.name}
              </TableCell>
              <TableCell>{typeOf(i)}</TableCell>
              <TableCell>{formatMoney(i.amountUsd, { cents: true })}</TableCell>
              <TableCell>{i.monthlyUsd == null ? '—' : formatMoney(i.monthlyUsd, { cents: true })}</TableCell>
              <TableCell>{dates(i)}</TableCell>
              {!readOnly && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <CostItemDialog item={i} />
                    <ArchiveButton item={i} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
