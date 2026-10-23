'use client';
import { Switch } from '@cs/ui';
import { useOptimistic, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import type { FormResult } from '@/server/forms';
import { setPrefAction } from './actions';

/**
 * `useOptimistic` + `startTransition` (pattern: `NotifySwitch`). The optimistic value drops back to the stored one when the
 * transition ends, so a refused save reverts the switch by itself; the refusal stays visible next to it.
 */
export function PrefSwitch({ contactId, kind, channel, enabled, label }: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean; label: string }) {
  const [checked, setChecked] = useOptimistic(enabled);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={checked}
        disabled={isPending}
        aria-label={label}
        onCheckedChange={(next: boolean) => {
          if (isPending) return;
          startTransition(async () => {
            setChecked(next);
            setResult(await setPrefAction({ contactId, kind, channel, enabled: next }));
          });
        }}
      />
      {!result.ok && <ErrorNote compact>{result.error}</ErrorNote>}
    </div>
  );
}
