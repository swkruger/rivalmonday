'use client';
import { Button, StatusChip } from '@cs/ui';
import { useActionState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { formatMoney } from '@/lib/format';
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

const th = 'px-3 py-2 font-semibold';
const td = 'px-3 py-2';
const numCls = `${fieldCls} w-24`;

function Row({ item, defaultLimitUsd, canEdit }: { item: ClientLimitItem; defaultLimitUsd: number; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(setClientLimitsAction, { ok: true } as FormResult);
  const level = LEVEL[item.level];
  const form = `limits-${item.clientId}`;
  return (
    <tr className="border-t border-[#EEF2F6]">
      <th scope="row" className={`${td} text-left font-semibold`}>
        {item.name}
        {item.status !== 'active' && <span className="ml-2 text-xs font-normal text-muted-foreground">{item.status}</span>}
      </th>
      <td className={`${td} text-right`}>{formatMoney(item.spendUsd, { cents: true })}</td>
      <td className={`${td} text-right`}>{formatMoney(item.effectiveLimitUsd, { cents: true })}</td>
      <td className={td}><StatusChip tone={level.tone}>{level.label}</StatusChip></td>
      {canEdit ? (
        <>
          <td className={td}>
            <input form={form} name="spendLimitUsd" type="number" inputMode="decimal" step="0.01" min="1" aria-label={`Limit override for ${item.name}`}
              defaultValue={item.spendLimitUsd ?? ''} placeholder={`Default (${formatMoney(defaultLimitUsd)})`} className={`${numCls} w-32`} />
          </td>
          <td className={td}>
            <input form={form} name="competitorLimit" type="number" step="1" min="1" required aria-label={`Competitor limit for ${item.name}`} defaultValue={item.competitorLimit} className={numCls} />
          </td>
          <td className={td}>
            <input form={form} name="askMonthlyQuota" type="number" step="1" min="0" required aria-label={`Ask quota for ${item.name}`} defaultValue={item.askMonthlyQuota} className={numCls} />
          </td>
          <td className={td}>
            <form id={form} action={formAction} onReset={(e) => e.preventDefault()} className="flex items-center gap-2">
              <input type="hidden" name="clientId" value={item.clientId} />
              <Button type="submit" variant="outline" disabled={pending}>Save</Button>
              {state.ok && state.message && <span role="status" className="text-sm text-ink">{state.message}</span>}
              {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
            </form>
          </td>
        </>
      ) : (
        <>
          <td className={td}>{item.spendLimitUsd === null ? 'Default' : formatMoney(item.spendLimitUsd, { cents: true })}</td>
          <td className={td}>{item.competitorLimit}</td>
          <td className={td}>{item.askMonthlyQuota}</td>
          <td className={td} />
        </>
      )}
    </tr>
  );
}

/**
 * Client limits table on the platform agency page (7b1 d13). Staff and owners edit (`canEdit`); viewers read. A blank
 * override clears it back to the default. Platform surface, so dollars are shown.
 */
export function ClientLimitsTable({ data, canEdit }: { data: ClientLimits; canEdit: boolean }) {
  const readOnly = useReadOnly();
  const editable = canEdit && !readOnly;
  if (data.items.length === 0) return <p className="text-sm text-muted-foreground">No clients yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className={th}>Client</th>
            <th scope="col" className={`${th} text-right`}>Spend this month</th>
            <th scope="col" className={`${th} text-right`}>Limit</th>
            <th scope="col" className={th}>Level</th>
            <th scope="col" className={th}>Limit override</th>
            <th scope="col" className={th}>Competitors</th>
            <th scope="col" className={th}>Ask per month</th>
            <th scope="col" className={th}><span className="sr-only">Save</span></th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((i) => (
            <Row key={i.clientId} item={i} defaultLimitUsd={data.defaultLimitUsd} canEdit={editable} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
