'use client';
import { Button, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { formatMoney } from '@/lib/format';
import { CLIENT_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { fieldCls } from '../../_components/mini-form';
import { setClientLimitsAction } from './actions';

export interface ClientLimitItem {
  clientId: string;
  name: string;
  status: string;
  spendUsd: number;
  effectiveLimitUsd: number;
  spendLimitUsd: number | null;
  competitorLimit: number;
  askMonthlyQuota: number;
  level: 'ok' | 'near' | 'reached' | 'paused';
  spendPausedAt: string | null;
}
export interface ClientLimits {
  defaultLimitUsd: number;
  pausePercent: number;
  items: ClientLimitItem[];
}

const LEVEL = {
  ok: { tone: 'success', label: 'OK' },
  near: { tone: 'info', label: 'Near limit' },
  reached: { tone: 'neutral', label: 'Reached' },
  paused: { tone: 'neutral', label: 'Paused' },
} as const;

const numCls = `${fieldCls} w-24`;

function Row({ item, defaultLimitUsd, canEdit }: { item: ClientLimitItem; defaultLimitUsd: number; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(setClientLimitsAction, { ok: true } as FormResult);
  const level = LEVEL[item.level];
  const form = `limits-${item.clientId}`;
  return (
    <TableRow>
      <TableHead scope="row" className="h-10 text-13 font-semibold text-ink">
        {item.name}
        {item.status !== 'active' && (
          <span className="ml-2 inline-block">
            <StatusChip tone={labelFor(CLIENT_STATUS, item.status).tone}>{labelFor(CLIENT_STATUS, item.status).label}</StatusChip>
          </span>
        )}
      </TableHead>
      <TableCell numeric>{formatMoney(item.spendUsd, { cents: true })}</TableCell>
      <TableCell numeric>{formatMoney(item.effectiveLimitUsd, { cents: true })}</TableCell>
      <TableCell><StatusChip tone={level.tone}>{level.label}</StatusChip></TableCell>
      {canEdit ? (
        <>
          <TableCell>
            <input form={form} name="spendLimitUsd" type="number" inputMode="decimal" step="0.01" min="1" aria-label={`Limit override for ${item.name}`}
              defaultValue={item.spendLimitUsd ?? ''} placeholder={`Default (${formatMoney(defaultLimitUsd)})`} className={`${numCls} w-32`} />
          </TableCell>
          <TableCell>
            <input form={form} name="competitorLimit" type="number" step="1" min="1" required aria-label={`Competitor limit for ${item.name}`} defaultValue={item.competitorLimit} className={numCls} />
          </TableCell>
          <TableCell>
            <input form={form} name="askMonthlyQuota" type="number" step="1" min="0" required aria-label={`Ask quota for ${item.name}`} defaultValue={item.askMonthlyQuota} className={numCls} />
          </TableCell>
          <TableCell>
            <form id={form} action={formAction} onReset={(e) => e.preventDefault()} className="flex items-center gap-2">
              <input type="hidden" name="clientId" value={item.clientId} />
              <Button type="submit" variant="outline" disabled={pending}>Save</Button>
              {state.ok && state.message && <span role="status" className="text-sm text-ink">{state.message}</span>}
              {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
            </form>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>{item.spendLimitUsd === null ? 'Default' : formatMoney(item.spendLimitUsd, { cents: true })}</TableCell>
          <TableCell>{item.competitorLimit}</TableCell>
          <TableCell>{item.askMonthlyQuota}</TableCell>
          <TableCell />
        </>
      )}
    </TableRow>
  );
}

/**
 * Client limits table on the platform agency page (7b1 d13). Staff and owners edit (`canEdit`); viewers read. A blank
 * override clears it back to the default. Platform surface, so dollars are shown.
 */
export function ClientLimitsTable({ data, canEdit }: { data: ClientLimits; canEdit: boolean }) {
  const readOnly = useReadOnly();
  const editable = canEdit && !readOnly;
  if (data.items.length === 0) return <p className="text-sm text-muted-ink">No clients yet.</p>;
  return (
    <TableFrame>
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Client</TableHead>
            <TableHead scope="col" numeric>Spend this month</TableHead>
            <TableHead scope="col" numeric>Limit</TableHead>
            <TableHead scope="col">Level</TableHead>
            <TableHead scope="col">Limit override</TableHead>
            <TableHead scope="col">Competitors</TableHead>
            <TableHead scope="col">Ask per month</TableHead>
            <TableHead scope="col"><span className="sr-only">Save</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((i) => (
            <Row key={i.clientId} item={i} defaultLimitUsd={data.defaultLimitUsd} canEdit={editable} />
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
