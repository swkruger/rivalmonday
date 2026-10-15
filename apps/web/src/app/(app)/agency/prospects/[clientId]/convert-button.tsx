'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { FormError } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

export function ConvertButton({ clientId, action, canUpgrade = false }: {
  canUpgrade?: boolean;
  clientId: string; action: (p: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <FormError state={state} canUpgrade={canUpgrade} />
      <Button type="submit" disabled={pending} className="self-start">Convert to client</Button>
    </form>
  );
}
