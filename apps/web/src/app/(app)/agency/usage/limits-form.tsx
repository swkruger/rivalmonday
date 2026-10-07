'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

export function LimitsForm({
  action,
  clientId,
  clientName,
  capUsd,
  competitorLimit,
}: {
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  clientId: string;
  clientName: string;
  capUsd: number;
  competitorLimit: number;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);

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
      <Button type="submit" disabled={pending} aria-label={`Save limits for ${clientName}`}>
        Save
      </Button>
      {!state.ok && state.error && (
        <p role="alert" className="w-full rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      {state.ok && state.message && <p className="w-full rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
