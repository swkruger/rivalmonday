'use client';
import type { TrackedPageView } from '@cs/tools';
import { Button, Input, Label, Switch } from '@cs/ui';
import { useActionState, useOptimistic, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';
import { addPageAction, setPinAction } from '../actions';

const selectClass =
  'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>;
  }
  return null;
}

/** Decision 17 (5b-1 Minor 3): same optimistic pattern as AutoSendSwitch — React reverts to `page.pinned` once the transition ends. */
export function PinPageSwitch({ clientId, competitorId, page }: { clientId: string; competitorId: string; page: TrackedPageView }) {
  const [pinned, setPinned] = useOptimistic(page.pinned);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={pinned}
        disabled={isPending}
        aria-label={`Pinned — ${page.url}`}
        onCheckedChange={(next: boolean) => {
          if (isPending) return;
          startTransition(async () => {
            setPinned(next);
            const fd = new FormData();
            fd.set('clientId', clientId);
            fd.set('competitorId', competitorId);
            fd.set('pageId', page.id);
            fd.set('pinned', next ? 'true' : 'false');
            setResult(await setPinAction({ ok: true }, fd));
          });
        }}
      />
      <Message state={result} />
    </div>
  );
}

export function AddPageForm({ clientId, competitorId, pageTypes }: { clientId: string; competitorId: string; pageTypes: string[] }) {
  const [state, formAction, pending] = useActionState(addPageAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="competitorId" value={competitorId} />
      <Message state={state} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="page-url">Page URL</Label>
          <Input id="page-url" name="url" type="url" required className="w-72" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="page-type">Type</Label>
          <select id="page-type" name="pageType" className={selectClass} defaultValue={pageTypes[0]}>
            {pageTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          Add page
        </Button>
      </div>
    </form>
  );
}
