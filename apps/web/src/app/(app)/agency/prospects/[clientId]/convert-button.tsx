'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

export function ConvertButton({ clientId, action }: {
  clientId: string; action: (p: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      {!state.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">Convert to client</Button>
    </form>
  );
}
