'use client';
import { Switch } from '@cs/ui';
import { useOptimistic, useTransition } from 'react';
import { setPrefAction } from './actions';

export function PrefSwitch({ contactId, kind, channel, enabled, label }: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean; label: string }) {
  const [checked, setChecked] = useOptimistic(enabled);
  const [, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      aria-label={label}
      onCheckedChange={(next: boolean) => {
        startTransition(async () => {
          setChecked(next);
          await setPrefAction({ contactId, kind, channel, enabled: next });
        });
      }}
    />
  );
}
