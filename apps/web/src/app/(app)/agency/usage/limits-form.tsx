'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

export function LimitsForm({
  action,
  clientId,
  clientName,
  capUsd,
  competitorLimit,
  askQuota,
}: {
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  clientId: string;
  clientName: string;
  capUsd: number;
  competitorLimit: number;
  /** Questions per month; passed for agency admins only (the tool enforces it too). */
  askQuota?: number;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  if (useReadOnly()) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cap-${clientId}`}>Cap</Label>
        <Input
          id={`cap-${clientId}`}
          name="monthlyCapUsd"
          type="number"
          step="0.01"
          min="1"
          max="10000"
          defaultValue={capUsd}
          aria-label={`Monthly cap for ${clientName} (USD)`}
          className="w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`limit-${clientId}`}>Limit</Label>
        <Input
          id={`limit-${clientId}`}
          name="competitorLimit"
          type="number"
          step="1"
          min="1"
          max="10"
          defaultValue={competitorLimit}
          aria-label={`Competitor limit for ${clientName}`}
          className="w-20"
        />
      </div>
      {askQuota !== undefined && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`quota-${clientId}`}>Questions per month</Label>
          <Input
            id={`quota-${clientId}`}
            name="askMonthlyQuota"
            type="number"
            step="1"
            min="0"
            max="100000"
            defaultValue={askQuota}
            aria-label={`Questions per month for ${clientName}`}
            className="w-28"
          />
        </div>
      )}
      <Button type="submit" disabled={pending} aria-label={`Save limits for ${clientName}`}>
        Save
      </Button>
      {!state.ok && state.error && (
        <ErrorNote focusKey={state} className="w-full">
          {state.error}
        </ErrorNote>
      )}
      {state.ok && state.message && <p className="w-full rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
