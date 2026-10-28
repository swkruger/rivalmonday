'use client';
import type { DecisionReviewView } from '@cs/tools';
import { Band, Button, Card, nativeSelectClass } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';
import { HelpEmpty } from '@/components/help/empty-state';
import { OffPageNotice } from '@/components/prev-next';

const selectClass = `${nativeSelectClass} w-full max-w-md`;
/** A review plus the card header's display text (computed on the server: labels, age in the viewer's zone). */
export type ReviewCard = DecisionReviewView & { sourceText: string; kindText: string; age: string };
type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * One action state for every item's Resolve, held here (not per item) so the result survives the resolved item
 * leaving the list on revalidate (HANDOVER §6; precedent `AlertList`). The dispatcher is handed straight to each
 * item's native `<form action={formAction}>`, so the browser/React build the submitted FormData, not this component.
 */
export function ReviewQueue({ items, total, offPage = false, action }: { items: ReviewCard[]; total: number; offPage?: boolean; action: Action }) {
  const [result, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <ErrorNote focusKey={result}>{result.error}</ErrorNote>}
      {result.ok && result.message && <p className="rounded-md bg-muted-surface p-3 text-ink">{result.message}</p>}
      {total > 0 && <h2 className="text-lg font-semibold">Waiting for review ({total})</h2>}
      {items.length === 0 && (offPage ? <OffPageNotice firstHref="/platform/reviews" /> : <HelpEmpty id="platform.reviews.queue" guideAnchor="what-this-page-tells-you" />)}
      {items.map((item) => (
        <Card key={item.id} className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="reviewId" value={item.id} />
          <div className="text-13 text-muted-ink">{item.competitorName} · {item.sourceText} · {item.kindText} · {item.age}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="mb-1 text-13 text-muted-ink">Before</div><Band tone="muted"><pre className="whitespace-pre-wrap text-sm">{item.beforeText ?? '—'}</pre></Band></div>
            <div><div className="mb-1 text-13 text-muted-ink">After</div><Band tone="muted"><pre className="whitespace-pre-wrap text-sm">{item.afterText ?? '—'}</pre></Band></div>
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
                {said !== null && <span className="text-13 text-muted-ink">Model said: {said}{q.confidence !== null ? ` (${Math.round(q.confidence * 100)}%)` : ''}</span>}
              </div>
            );
          })}
          <Button type="submit" disabled={pending} className="self-start">Resolve</Button>
        </form>
        </Card>
      ))}
    </div>
  );
}
