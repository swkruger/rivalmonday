'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { refreshCostsAction } from '../actions';

/** "Refresh now": enqueues the worker job; the message is the decided toast copy, shown inline. */
export function RefreshButton({ refreshQueued }: { refreshQueued: boolean }) {
  const [state, formAction, pending] = useActionState(refreshCostsAction, { ok: true } as FormResult);
  return (
    <WriteGuard>
      <form action={formAction} className="flex items-center gap-3">
        {state.ok && state.message && <span role="status" className="text-sm text-muted-foreground">{state.message}</span>}
        {!state.ok && <span role="alert" className="text-sm text-ink">{state.error}</span>}
        <Button type="submit" variant="outline" disabled={pending || refreshQueued}>
          {refreshQueued ? 'Refreshing…' : 'Refresh now'}
        </Button>
      </form>
    </WriteGuard>
  );
}
