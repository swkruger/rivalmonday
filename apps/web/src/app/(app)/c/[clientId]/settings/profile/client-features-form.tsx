'use client';
import { SaveBar } from '@cs/ui';
import { useActionState, useState } from 'react';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

/** The features with a switch; a client keeps any feature without one (hidden input). */
const SWITCHES: { value: string; label: string; help: string }[] = [
  { value: 'dashboard', label: 'Client dashboard', help: 'Client users get the workspace: overview, changes, moves, pricing, ads, reviews and rankings.' },
  { value: 'alert_rules', label: 'Alert rules', help: 'Client owners can change the alert and brief thresholds.' },
  { value: 'manage_competitors', label: 'Manage competitors', help: 'Client owners can add and remove the competitors they track.' },
  { value: 'ask', label: 'Ask assistant', help: 'Client users can ask the assistant questions about their competitors, answered from the monitored evidence.' },
  { value: 'mcp', label: 'AI connection', help: 'Shows the AI connection settings page.' },
];

export function ClientFeaturesForm({ clientId, features, action, role, reviewAllowed = true }: {
  clientId: string;
  features: string[];
  /** The review toggle is for agency admins only (the tool enforces it too). */
  role?: string;
  reviewAllowed?: boolean;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  // React 19 resets a form after every action, errors included; every checkbox is controlled (and onReset is blocked), so a refused save keeps the choices.
  const [on, setOn] = useState<string[]>(features);
  const [review, setReview] = useState(reviewAllowed);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const kept = features.filter((f) => !SWITCHES.some((s) => s.value === f));
  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} onChange={() => setDirty(true)} className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      <input type="hidden" name="clientId" value={clientId} />
      {kept.map((f) => (
        <input key={f} type="hidden" name="feature" value={f} />
      ))}
      <fieldset disabled={readOnly} className="contents">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-bold">Client features</legend>
        {SWITCHES.map((s) => (
          <label key={s.value} className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input type="checkbox" name="feature" value={s.value} checked={on.includes(s.value)} onChange={(e) => setOn((cur) => (e.target.checked ? [...cur, s.value] : cur.filter((x) => x !== s.value)))} className="mt-1 h-4 w-4" />
            <span>
              <span className="block font-medium">{s.label}</span>
              <span className="block text-sm text-muted-foreground">{s.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {role === 'agency_admin' && (
        <>
          <input type="hidden" name="askReviewPresent" value="1" />
          <label className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input type="checkbox" name="askReviewAllowed" checked={review} onChange={(e) => setReview(e.target.checked)} className="mt-1 h-4 w-4" />
            <span>
              <span className="block font-medium">Allow review to improve answers</span>
              <span className="block text-sm text-muted-foreground">Lets the platform team read this client&apos;s Ask conversations to improve answer quality.</span>
            </span>
          </label>
        </>
      )}
      </fieldset>
      {!state.ok && state.error && (
        <ErrorNote focusKey={state}>
          {state.error}
        </ErrorNote>
      )}
      {state.ok && !dirty && state.message && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
      <WriteGuard>
        <SaveBar
          dirty={dirty}
          pending={pending}
          saveLabel="Save features"
          onReset={() => {
            setOn(features);
            setReview(reviewAllowed);
            setDirty(false);
          }}
        />
      </WriteGuard>
    </form>
  );
}
