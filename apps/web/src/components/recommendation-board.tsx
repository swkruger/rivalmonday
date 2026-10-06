'use client';
import type { RecommendationView } from '@cs/tools';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

type SetStatusAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;
type Status = RecommendationView['status'];

const SOURCE_LABEL: Record<string, string> = { brief: 'From weekly brief', move: 'From a detected move', ask: 'From Ask' };
const textareaClass = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Target {
  status: Status;
  label: string;
  aria: string;
}

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <p role="alert" className="mt-2 rounded-lg bg-muted-surface p-3 text-ink">
        {state.error}
      </p>
    );
  }
  return null;
}

/** The quick-action buttons for a card (Start/Done/Back to to-do/Reopen) share one form and one pending state, so clicking one disables its siblings too. */
function QuickActionsForm({ action, clientId, item, targets }: { action: SetStatusAction; clientId: string; item: RecommendationView; targets: Target[] }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="recommendationId" value={item.id} />
      <input type="hidden" name="clientId" value={clientId} />
      {targets.map((t) => (
        <Button key={t.status} type="submit" name="status" value={t.status} variant="outline" size="sm" aria-label={t.aria} disabled={pending}>
          {t.label}
        </Button>
      ))}
      <Message state={state} />
    </form>
  );
}

function DismissDialog({ action, clientId, item }: { action: SetStatusAction; clientId: string; item: RecommendationView }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={`Dismiss ${item.title}`}>
          Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss “{item.title}”?</DialogTitle>
          <DialogDescription>A reason is required — this helps us tune future recommendations.</DialogDescription>
        </DialogHeader>
        <Message state={state} />
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="recommendationId" value={item.id} />
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="status" value="dismissed" />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${item.id}`}>Reason</Label>
            <textarea id={`reason-${item.id}`} name="reason" required minLength={1} maxLength={500} className={textareaClass} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              Dismiss
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A single-button form reused for "Reopen" — from a done card (back to in_progress) and from the dismissed list (back to todo). */
function ReopenForm({ action, clientId, item, target }: { action: SetStatusAction; clientId: string; item: RecommendationView; target: Status }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="recommendationId" value={item.id} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="status" value={target} />
      <Button type="submit" variant="outline" size="sm" aria-label={`Reopen ${item.title}`} disabled={pending}>
        Reopen
      </Button>
      <Message state={state} />
    </form>
  );
}

function targetsFor(status: Status, title: string): Target[] {
  if (status === 'todo') {
    return [
      { status: 'in_progress', label: 'Start', aria: `Start ${title}` },
      { status: 'done', label: 'Done', aria: `Mark ${title} done` },
    ];
  }
  if (status === 'in_progress') {
    return [
      { status: 'done', label: 'Done', aria: `Mark ${title} done` },
      { status: 'todo', label: 'Back to to-do', aria: `Move ${title} back to to-do` },
    ];
  }
  return [];
}

function RecommendationCard({ item, clientId, canEdit, agency, action }: { item: RecommendationView; clientId: string; canEdit: boolean; agency: boolean; action: SetStatusAction }) {
  return (
    <article className="rounded-[14px] bg-surface p-4 shadow-card">
      <p className="font-bold">{item.title}</p>
      <p className="mt-1 text-muted-foreground">{item.rationale}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Effort {item.effort}</span>
        <span className="rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Impact {item.impact}</span>
        <span className="rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">{item.owner === 'client' ? 'For you' : 'Agency'}</span>
        <span className="rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">{SOURCE_LABEL[item.source] ?? item.source}</span>
        <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">{item.evidenceIds.length} evidence items</span>
        {agency && item.upsellTag && <span className="rounded-md bg-[#FFF3DC] px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {item.upsellTag}</span>}
      </div>
      {canEdit &&
        (item.status === 'done' ? (
          <div className="mt-3">
            <ReopenForm action={action} clientId={clientId} item={item} target="in_progress" />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <QuickActionsForm action={action} clientId={clientId} item={item} targets={targetsFor(item.status, item.title)} />
            <DismissDialog action={action} clientId={clientId} item={item} />
          </div>
        ))}
    </article>
  );
}

interface RecommendationBoardProps {
  clientId: string;
  items: RecommendationView[];
  canEdit: boolean;
  agency: boolean;
  action: SetStatusAction;
}

/** Agency and client roles (including guests) land here from the nav — `canEdit` is false for viewers and guests. */
export function RecommendationBoard({ clientId, items, canEdit, agency, action }: RecommendationBoardProps) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No recommendations yet — they arrive with each approved weekly brief.</p>;
  }
  const todo = items.filter((i) => i.status === 'todo');
  const inProgress = items.filter((i) => i.status === 'in_progress');
  const done = items.filter((i) => i.status === 'done');
  const dismissed = items.filter((i) => i.status === 'dismissed');

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-label="To do" className="flex flex-col gap-3">
          <h2 className="font-semibold">To do ({todo.length})</h2>
          {todo.map((item) => (
            <RecommendationCard key={item.id} item={item} clientId={clientId} canEdit={canEdit} agency={agency} action={action} />
          ))}
        </section>
        <section aria-label="In progress" className="flex flex-col gap-3">
          <h2 className="font-semibold">In progress ({inProgress.length})</h2>
          {inProgress.map((item) => (
            <RecommendationCard key={item.id} item={item} clientId={clientId} canEdit={canEdit} agency={agency} action={action} />
          ))}
        </section>
        <section aria-label="Done" className="flex flex-col gap-3">
          <h2 className="font-semibold">Done ({done.length})</h2>
          {done.map((item) => (
            <RecommendationCard key={item.id} item={item} clientId={clientId} canEdit={canEdit} agency={agency} action={action} />
          ))}
        </section>
      </div>
      <details className="mt-5 rounded-[14px] bg-surface p-4 shadow-card">
        <summary className="cursor-pointer font-semibold">{dismissed.length} dismissed</summary>
        <ul className="mt-3 flex flex-col gap-3">
          {dismissed.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{item.title}</span>
              <span className="text-muted-foreground">{item.dismissReason}</span>
              {canEdit && <ReopenForm action={action} clientId={clientId} item={item} target="todo" />}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
