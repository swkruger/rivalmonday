'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

/** The features with a switch; a client keeps any feature without one (hidden input). */
const SWITCHES: { value: string; label: string; help: string }[] = [
  { value: 'dashboard', label: 'Client dashboard', help: 'Client users get the workspace: overview, changes, moves, pricing, ads, reviews and rankings.' },
  { value: 'alert_rules', label: 'Alert rules', help: 'Client owners can change the alert and brief thresholds.' },
  { value: 'manage_competitors', label: 'Manage competitors', help: 'Client owners can add and remove the competitors they track.' },
  { value: 'ask', label: 'Ask assistant', help: 'Client users can ask the assistant questions about their competitors, answered from the monitored evidence.' },
  { value: 'mcp', label: 'AI connections', help: 'Shows the AI connections page (coming soon).' },
];

export function ClientFeaturesForm({ clientId, features, action, role, reviewAllowed = true }: {
  clientId: string;
  features: string[];
  /** The review toggle is for agency admins only (the tool enforces it too). */
  role?: string;
  reviewAllowed?: boolean;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const kept = features.filter((f) => !SWITCHES.some((s) => s.value === f));
  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      <input type="hidden" name="clientId" value={clientId} />
      {kept.map((f) => (
        <input key={f} type="hidden" name="feature" value={f} />
      ))}
      <fieldset disabled={readOnly} className="contents">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-bold">Client features</legend>
        {SWITCHES.map((s) => (
          <label key={s.value} className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input type="checkbox" name="feature" value={s.value} defaultChecked={features.includes(s.value)} className="mt-1 h-4 w-4" />
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
            <input type="checkbox" name="askReviewAllowed" defaultChecked={reviewAllowed} className="mt-1 h-4 w-4" />
            <span>
              <span className="block font-medium">Allow review to improve answers</span>
              <span className="block text-sm text-muted-foreground">Lets the platform team read this client&apos;s Ask conversations to improve answer quality.</span>
            </span>
          </label>
        </>
      )}
      </fieldset>
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
      <WriteGuard>
        <div>
          <Button type="submit" disabled={pending}>
            Save features
          </Button>
        </div>
      </WriteGuard>
    </form>
  );
}
