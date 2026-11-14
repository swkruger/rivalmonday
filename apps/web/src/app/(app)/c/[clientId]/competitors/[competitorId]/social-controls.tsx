'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { confirmSocialAction, findSocialAction } from '../actions';

const INITIAL: FormResult = { ok: true };

function Result({ state }: { state: FormResult }) {
  if (!state.ok && state.error) return <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>;
  if (state.ok && state.message) return <p role="status" className="text-sm text-ink">{state.message}</p>;
  return null;
}

/** "Confirm" and "Not them" for one suggested account (agency roles; the parent decides). */
export function SuggestedActions({ clientId, competitorId, accountId, handle }: { clientId: string; competitorId: string; accountId: string; handle: string }) {
  const [state, action, pending] = useActionState(confirmSocialAction, INITIAL);
  return (
    <WriteGuard>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="competitorId" value={competitorId} />
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" name="decision" value="confirm" variant="outline" disabled={pending} aria-label={`Confirm ${handle}`}>Confirm</Button>
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending} aria-label={`${handle} is not them`}>Not them</Button>
        <Result state={state} />
      </form>
    </WriteGuard>
  );
}

/** "Find accounts" and "Add link" (agency roles). Messages live here so they survive revalidation. */
export function FindAndAdd({ clientId, competitorId }: { clientId: string; competitorId: string }) {
  const [found, find, finding] = useActionState(findSocialAction, INITIAL);
  const [added, add, adding] = useActionState(confirmSocialAction, INITIAL);
  return (
    <WriteGuard>
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <form action={find} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="competitorId" value={competitorId} />
          <Button type="submit" variant="outline" disabled={finding}>Find accounts</Button>
          <Result state={found} />
        </form>
        <form action={add} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="competitorId" value={competitorId} />
          <input type="hidden" name="decision" value="confirm" />
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="social-link">Add link</Label>
            <Input id="social-link" name="url" required placeholder="facebook.com/yourrival" className="w-full sm:w-72" />
          </div>
          <Button type="submit" variant="outline" disabled={adding}>Add account</Button>
        </form>
        <Result state={added} />
      </div>
    </WriteGuard>
  );
}
