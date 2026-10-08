'use client';
/**
 * Event feedback (Task 9 brief). A plain `FormData` form with three submit buttons sharing one `name="verdict"`
 * field — the activated button's `value` is the one included in the submitted `FormData` (native HTML behaviour).
 * One `useActionState` in this component, which stays mounted across the `revalidatePath` the action triggers
 * (precedents `ReviewFooter`, `AlertList` — HANDOVER §6). Never imports `@cs/tools`/`@cs/email`: the verdict values
 * are hardcoded here and `current`/`action` are plain data/functions passed by the server parent.
 */
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

type Verdict = 'useful' | 'not_relevant' | 'wrong';

const OPTIONS: { value: Verdict; label: string }[] = [
  { value: 'useful', label: 'Useful' },
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'wrong', label: 'Wrong' },
];

export function FeedbackButtons({
  clientId,
  eventId,
  current,
  action,
}: {
  clientId: string;
  eventId: string;
  current: Verdict | null;
  action: (state: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="eventId" value={eventId} />
      <span className="text-sm font-semibold text-ink">Was this useful?</span>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Button key={o.value} type="submit" name="verdict" value={o.value} variant="outline" size="sm" aria-pressed={current === o.value} disabled={pending}>
            {o.label}
          </Button>
        ))}
      </div>
      {!state.ok && state.error ? (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      ) : state.ok && state.message ? (
        <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>
      ) : null}
    </form>
  );
}
