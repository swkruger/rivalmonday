'use client';
import { SaveBar, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState, useEffect, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { formatMoney } from '@/lib/format';
import { CLIENT_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { fieldCls } from '../../_components/mini-form';
import { type ClientLimitsRow, saveClientLimitsAction } from './actions';

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

type Fields = Pick<ClientLimitsRow, 'spendLimitUsd' | 'competitorLimit' | 'askMonthlyQuota'>;
const fieldsOf = (i: ClientLimitItem): Fields => ({ spendLimitUsd: i.spendLimitUsd === null ? '' : String(i.spendLimitUsd), competitorLimit: String(i.competitorLimit), askMonthlyQuota: String(i.askMonthlyQuota) });
/** A row differs from its stored values (a blank override means the default, i.e. null). */
const changed = (i: ClientLimitItem, v: Fields) =>
  (v.spendLimitUsd.trim() === '' ? i.spendLimitUsd !== null : Number(v.spendLimitUsd) !== i.spendLimitUsd)
  || Number(v.competitorLimit) !== i.competitorLimit || Number(v.askMonthlyQuota) !== i.askMonthlyQuota;

function Row({ item, defaultLimitUsd, values, onChange }: {
  item: ClientLimitItem; defaultLimitUsd: number; values: Fields | null; onChange: (k: keyof Fields, v: string) => void;
}) {
  const level = LEVEL[item.level];
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
      {values ? (
        <>
          <TableCell>
            <input name="spendLimitUsd" type="number" inputMode="decimal" step="0.01" min="1" aria-label={`Limit override for ${item.name}`}
              value={values.spendLimitUsd} onChange={(e) => onChange('spendLimitUsd', e.target.value)} placeholder={`Default (${formatMoney(defaultLimitUsd)})`} className={`${numCls} w-32`} />
          </TableCell>
          <TableCell>
            <input name="competitorLimit" type="number" step="1" min="1" required aria-label={`Competitor limit for ${item.name}`}
              value={values.competitorLimit} onChange={(e) => onChange('competitorLimit', e.target.value)} className={numCls} />
          </TableCell>
          <TableCell>
            <input name="askMonthlyQuota" type="number" step="1" min="0" required aria-label={`Ask quota for ${item.name}`}
              value={values.askMonthlyQuota} onChange={(e) => onChange('askMonthlyQuota', e.target.value)} className={numCls} />
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>{item.spendLimitUsd === null ? 'Default' : formatMoney(item.spendLimitUsd, { cents: true })}</TableCell>
          <TableCell>{item.competitorLimit}</TableCell>
          <TableCell>{item.askMonthlyQuota}</TableCell>
        </>
      )}
    </TableRow>
  );
}

/**
 * Client limits table on the platform agency page (7b1 d13). Staff and owners edit (`canEdit`); viewers read. A blank
 * override clears it back to the default. Platform surface, so dollars are shown. One Save for the table (SaveBar, shown
 * while a row differs from its stored values): only changed rows are posted to `saveClientLimitsAction`, and its one result
 * line stays mounted here. Edits are kept per field over the stored values, so after a save the revalidated rows are clean
 * and a row that was refused stays dirty.
 */
export function ClientLimitsTable({ data, canEdit }: { data: ClientLimits; canEdit: boolean }) {
  const readOnly = useReadOnly();
  const editable = canEdit && !readOnly;
  const [edits, setEdits] = useState<Record<string, Partial<Fields>>>({});
  const [state, formAction, pending] = useActionState(saveClientLimitsAction, { ok: true } as FormResult);
  // A fully successful save starts from the revalidated values again.
  useEffect(() => {
    if (state.ok && state.message) setEdits({});
  }, [state]);
  if (data.items.length === 0) return <p className="text-sm text-muted-ink">No clients yet.</p>;

  const valuesOf = (i: ClientLimitItem): Fields => ({ ...fieldsOf(i), ...edits[i.clientId] });
  const dirtyRows = data.items.filter((i) => changed(i, valuesOf(i)));
  const submit = () => {
    const rows: ClientLimitsRow[] = dirtyRows.map((i) => ({ clientId: i.clientId, name: i.name, ...valuesOf(i) }));
    const fd = new FormData();
    fd.set('rows', JSON.stringify(rows));
    formAction(fd);
  };
  const table = (
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((i) => (
            <Row
              key={i.clientId}
              item={i}
              defaultLimitUsd={data.defaultLimitUsd}
              values={editable ? valuesOf(i) : null}
              onChange={(k, v) => setEdits((e) => ({ ...e, [i.clientId]: { ...e[i.clientId], [k]: v } }))}
            />
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
  if (!editable) return table;
  return (
    <form action={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
      {table}
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
      <SaveBar dirty={dirtyRows.length > 0} pending={pending} onReset={() => setEdits({})} />
    </form>
  );
}
