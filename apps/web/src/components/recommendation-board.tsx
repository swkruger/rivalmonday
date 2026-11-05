'use client';
import type { RecommendationView } from '@cs/tools';
import { Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label, Tag, textareaClass } from '@cs/ui';
import { Check } from 'lucide-react';
import { useActionState } from 'react';
import { EvidenceChips } from '@/components/evidence-chips';
import type { EvidenceRefs } from '@/server/evidence-refs';
import { IMPACT_TONE, LEVEL, labelFor } from '@/lib/labels';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

type SetStatusAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;
type Status = RecommendationView['status'];

/** Forward moves get the filled buttons (Start = ink, Done = green with a check); everything else is outline. */
export function variantFor(from: Status, to: Status): 'ink' | 'done' | 'outline' {
  if (from === 'todo' && to === 'in_progress') return 'ink';
  if (from === 'in_progress' && to === 'done') return 'done';
  return 'outline';
}

const LANES: { status: 'todo' | 'in_progress' | 'done'; label: string; tint: string; dot: string }[] = [
  { status: 'todo', label: 'To do', tint: 'bg-muted-surface', dot: 'bg-line-strong' },
  { status: 'in_progress', label: 'In progress', tint: 'bg-chip-info-bg', dot: 'bg-chip-info-text' },
  { status: 'done', label: 'Done', tint: 'bg-chip-success-bg', dot: 'bg-success' },
];

const SOURCE_LABEL: Record<string, string> = { brief: 'From weekly brief', move: 'From a detected move', ask: 'From Ask' };

interface Target {
  status: Status;
  label: string;
  aria: string;
}

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <ErrorNote focusKey={state} className="mt-2">
        {state.error}
      </ErrorNote>
    );
  }
  return null;
}

/** The quick-action buttons for a card (Start/Done/Back to to-do/Reopen) share one form and one pending state, so clicking one disables its siblings too. */
function QuickActionsForm({ action, clientId, item, targets }: { action: SetStatusAction; clientId: string; item: RecommendationView; targets: Target[] }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="recommendationId" value={item.id} />
      <input type="hidden" name="clientId" value={clientId} />
      {targets.map((t) => (
        <Button key={t.status} type="submit" name="status" value={t.status} variant={variantFor(item.status, t.status)} aria-label={t.aria} disabled={pending}>
          {variantFor(item.status, t.status) === 'done' && <Check aria-hidden />}
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
        <Button type="button" variant="ghost" aria-label={`Dismiss ${item.title}`}>
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
      <Button type="submit" variant="outline" aria-label={`Reopen ${item.title}`} disabled={pending}>
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

function RecommendationCard({ item, clientId, canEdit, agency, action, refs }: { item: RecommendationView; clientId: string; canEdit: boolean; agency: boolean; action: SetStatusAction; refs?: EvidenceRefs }) {
  return (
    <Card variant="raised" role="article" className="p-4.5">
      <p className="flex items-center gap-1.5 font-semibold">
        {item.status === 'done' && <Check aria-hidden className="size-4 shrink-0 text-success" />}
        {item.title}
      </p>
      <p className="mt-1 text-13 text-muted-ink">{item.rationale}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag emphasis="strong">Effort: {labelFor(LEVEL, item.effort).label}</Tag>
        <Tag emphasis="strong" tone={IMPACT_TONE[item.impact as 'L' | 'M' | 'H'] ?? 'neutral'}>Impact: {labelFor(LEVEL, item.impact).label}</Tag>
        <Tag emphasis="strong" tone={item.owner === 'client' ? 'neutral' : 'info'}>{item.owner === 'client' ? (agency ? 'Client' : 'For you') : 'Agency'}</Tag>
        <Tag emphasis="strong">{SOURCE_LABEL[item.source] ?? item.source}</Tag>
        {agency && item.upsellTag && <Tag>Upsell: {item.upsellTag}</Tag>}
        <EvidenceChips clientId={clientId} ids={item.evidenceIds} refs={refs} tone="info" />
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
    </Card>
  );
}

function EmptyColumn() {
  return <p className="text-sm text-muted-ink">Nothing here yet.</p>;
}

interface RecommendationBoardProps {
  clientId: string;
  items: RecommendationView[];
  canEdit: boolean;
  agency: boolean;
  action: SetStatusAction;
  /** What to show when there are no recommendations (the page passes the teaching empty state). */
  empty?: React.ReactNode;
  /** Display refs for the evidence chips (the page loads them server-side); chips fall back to "Evidence n" without. */
  refs?: EvidenceRefs;
}

/** Agency and client roles (including guests) land here from the nav — `canEdit` is false for viewers and guests. */
export function RecommendationBoard({ clientId, items, canEdit: canEditProp, agency, action, empty, refs }: RecommendationBoardProps) {
  // Phase 8b: status changes are writes, hidden in a support session.
  const canEdit = canEditProp && !useReadOnly();
  if (items.length === 0) {
    return <>{empty ?? <p className="text-muted-ink">No recommendations yet — they arrive with each approved weekly brief.</p>}</>;
  }
  const todo = items.filter((i) => i.status === 'todo');
  const inProgress = items.filter((i) => i.status === 'in_progress');
  const done = items.filter((i) => i.status === 'done');
  const dismissed = items.filter((i) => i.status === 'dismissed');

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        {LANES.map((lane) => {
          const list = lane.status === 'todo' ? todo : lane.status === 'in_progress' ? inProgress : done;
          return (
            <section key={lane.status} aria-label={lane.label} data-lane={lane.status} className={`flex flex-col gap-3 self-start rounded-lg p-3.5 ${lane.tint}`}>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <span aria-hidden className={`size-2 rounded-full ${lane.dot}`} />
                {lane.label} ({list.length})
              </h2>
              {list.length === 0 && <EmptyColumn />}
              {list.map((item) => (
                <RecommendationCard key={item.id} item={item} clientId={clientId} canEdit={canEdit} agency={agency} action={action} refs={refs} />
              ))}
            </section>
          );
        })}
      </div>
      <details className="mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer font-semibold">{dismissed.length} dismissed</summary>
        <ul className="mt-3 flex flex-col gap-3">
          {dismissed.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{item.title}</span>
              <span className="text-muted-ink">{item.dismissReason}</span>
              {canEdit && <ReopenForm action={action} clientId={clientId} item={item} target="todo" />}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
