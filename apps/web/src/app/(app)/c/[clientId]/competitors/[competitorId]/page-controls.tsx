'use client';
import type { TrackedPageView } from '@cs/tools';
import { Button, Input, Label, Switch } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
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

export function PinPageSwitch({ clientId, competitorId, page }: { clientId: string; competitorId: string; page: TrackedPageView }) {
  const [state, formAction, pending] = useActionState(setPinAction, { ok: true } as FormResult);
  const [pinned, setPinned] = useState(page.pinned);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="competitorId" value={competitorId} />
      <input type="hidden" name="pageId" value={page.id} />
      <input type="hidden" name="pinned" value={pinned ? 'true' : 'false'} />
      <Switch
        checked={pinned}
        disabled={pending}
        onCheckedChange={(next) => {
          setPinned(next);
          // Let the hidden `pinned` input re-render with `next` before the form submits.
          requestAnimationFrame(() => formRef.current?.requestSubmit());
        }}
        aria-label={`Pinned — ${page.url}`}
      />
      <Message state={state} />
    </form>
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
