'use client';
import { type FormEvent, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';

export type QueueAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * Shared scaffolding for the two platform-operator queues (`ReviewQueue`, `ThemeQueue`): a result message that
 * stays mounted across `revalidatePath` even after the acted-on item leaves the list (HANDOVER §6; precedents
 * `ReviewFooter`, `AlertList`), a pending `useTransition`, and a plain-`FormData` submit handler.
 *
 * `ThemeQueue` has two named submit buttons (Approve/Reject) sharing one form; jsdom's `FormData(form, submitter)`
 * support is inconsistent, so the submitter's name/value is set on the FormData explicitly instead of relying on it.
 */
export function useQueueAction(action: QueueAction) {
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [pending, startTransition] = useTransition();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget);
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    startTransition(async () => setResult(await action({ ok: true }, fd)));
  };
  return { result, pending, submit };
}
