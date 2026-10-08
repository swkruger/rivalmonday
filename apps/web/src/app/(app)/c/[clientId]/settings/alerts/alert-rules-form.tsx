'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

export interface AlertRulesProps {
  alert: number;
  brief: number;
  custom: boolean;
  defaults: { alert: number; brief: number };
}

export function AlertRulesForm({ clientId, rules, canEdit, action }: {
  clientId: string;
  rules: AlertRulesProps;
  canEdit: boolean;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      {canEdit ? (
        <>
          <input type="hidden" name="clientId" value={clientId} />
          <div key={`${rules.alert}-${rules.brief}`} className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="brief">Weekly brief from score</Label>
              <Input id="brief" name="brief" type="number" min={1} max={99} step={1} defaultValue={rules.brief} className="w-32" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="alert">Instant alert from score</Label>
              <Input id="alert" name="alert" type="number" min={2} max={100} step={1} defaultValue={rules.alert} className="w-32" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="intent" value="save" disabled={pending}>Save</Button>
            {rules.custom && (
              <Button type="submit" name="intent" value="reset" variant="outline" disabled={pending}>
                Use the defaults ({rules.defaults.alert}/{rules.defaults.brief})
              </Button>
            )}
          </div>
        </>
      ) : (
        <p>
          Instant alert from score {rules.alert}; weekly brief from score {rules.brief}. Ask your account manager to change these.
        </p>
      )}
      {!state.ok && state.error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
