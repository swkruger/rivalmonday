'use client';
import type { DecisionReviewView } from '@cs/tools';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

const selectClass = 'h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * One action state for every item's Resolve, held here (not per item) so the result survives the resolved item
 * leaving the list on revalidate (HANDOVER §6; precedent `AlertList`). The dispatcher is handed straight to each
 * item's native `<form action={formAction}>`, so the browser/React build the submitted FormData, not this component.
 */
export function ReviewQueue({ items, action }: { items: DecisionReviewView[]; action: Action }) {
  const [result, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{result.error}</p>}
      {result.ok && result.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{result.message}</p>}
      {items.length === 0 && <p className="text-muted-foreground">Nothing waiting for review.</p>}
      {items.map((item) => (
        <form key={item.id} action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
          <input type="hidden" name="reviewId" value={item.id} />
          <div className="text-sm text-muted-ink">{item.competitorName} · {item.source} · {item.kind} · {item.createdAt.slice(0, 10)}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="text-xs font-semibold uppercase text-muted-ink">Before</div><pre className="whitespace-pre-wrap rounded-lg bg-muted-surface p-3 text-sm">{item.beforeText ?? '—'}</pre></div>
            <div><div className="text-xs font-semibold uppercase text-muted-ink">After</div><pre className="whitespace-pre-wrap rounded-lg bg-muted-surface p-3 text-sm">{item.afterText ?? '—'}</pre></div>
          </div>
          {item.questions.map((q) => {
            const id = `${item.id}-${q.key}`;
            const said = q.options.find((o) => o.value === q.modelAnswer)?.label ?? q.modelAnswer;
            return (
              <div key={q.key} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-sm font-semibold">{q.instructions}</label>
                <select id={id} name={`q:${q.key}`} required defaultValue="" className={selectClass}>
                  <option value="" disabled>Choose…</option>
                  {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {said !== null && <span className="text-xs text-muted-ink">Model said: {said}{q.confidence !== null ? ` (${Math.round(q.confidence * 100)}%)` : ''}</span>}
              </div>
            );
          })}
          <Button type="submit" disabled={pending} className="self-start">Resolve</Button>
        </form>
      ))}
    </div>
  );
}
