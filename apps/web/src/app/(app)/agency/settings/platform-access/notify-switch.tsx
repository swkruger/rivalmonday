'use client';
import { Switch } from '@cs/ui';
import { useOptimistic, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';
import { setSupportNotifyAction } from './actions';

export const NOTIFY_LABEL = 'Email me when Rival Monday support opens a session';

/** Follows `AutoSendSwitch`: `useOptimistic` + `startTransition`, and the refusal stays visible below the switch. */
export function NotifySwitch({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useOptimistic(enabled);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch
          checked={checked}
          disabled={isPending}
          aria-label={NOTIFY_LABEL}
          onCheckedChange={(next: boolean) => {
            if (isPending) return;
            startTransition(async () => {
              setChecked(next);
              setResult(await setSupportNotifyAction(next));
            });
          }}
        />
        <span className="text-sm">{NOTIFY_LABEL}</span>
      </div>
      {!result.ok && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {result.error}
        </p>
      )}
    </div>
  );
}
