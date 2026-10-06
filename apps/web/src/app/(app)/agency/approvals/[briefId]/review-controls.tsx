'use client';
import type { BriefItemView } from '@cs/tools';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label, Switch } from '@cs/ui';
import { useActionState, useOptimistic, useState, useTransition } from 'react';
import type { FormResult } from '@/server/forms';
import { approveAction, autoSendAction, dropItemAction, editItemAction, moveItemAction, rateItemAction, sendNowAction } from './actions';

const textareaClass = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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

function EditItemDialog({ briefId, item }: { briefId: string; item: BriefItemView }) {
  const [state, formAction, pending] = useActionState(editItemAction, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>
        <Message state={state} />
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="briefId" value={briefId} />
          <input type="hidden" name="itemId" value={item.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`headline-${item.id}`}>Headline</Label>
            <textarea id={`headline-${item.id}`} name="headline" maxLength={1200} defaultValue={item.headline} className={textareaClass} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`what-changed-${item.id}`}>What changed</Label>
            <textarea id={`what-changed-${item.id}`} name="whatChanged" maxLength={1200} defaultValue={item.whatChanged} className={textareaClass} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`why-it-matters-${item.id}`}>Why it matters</Label>
            <textarea id={`why-it-matters-${item.id}`} name="whyItMatters" maxLength={1200} defaultValue={item.whyItMatters} className={textareaClass} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`suggested-action-${item.id}`}>Suggested action</Label>
            <textarea id={`suggested-action-${item.id}`} name="recommendedAction" maxLength={1200} defaultValue={item.recommendedAction} className={textareaClass} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveItemDialog({ briefId, item }: { briefId: string; item: BriefItemView }) {
  const [state, formAction, pending] = useActionState(dropItemAction, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this item?</DialogTitle>
          <DialogDescription>It is left out of the brief the client sees.</DialogDescription>
        </DialogHeader>
        <Message state={state} />
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="briefId" value={briefId} />
          <input type="hidden" name="itemId" value={item.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${item.id}`}>Reason (optional)</Label>
            <textarea id={`reason-${item.id}`} name="reason" maxLength={1200} className={textareaClass} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              Remove
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveButtons({ briefId, item, first, last }: { briefId: string; item: BriefItemView; first: boolean; last: boolean }) {
  const [, upAction, upPending] = useActionState(moveItemAction, { ok: true } as FormResult);
  const [, downAction, downPending] = useActionState(moveItemAction, { ok: true } as FormResult);
  return (
    <>
      <form action={upAction}>
        <input type="hidden" name="briefId" value={briefId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="dir" value="up" />
        <Button type="submit" variant="outline" size="sm" aria-label="Move up" disabled={first || upPending}>
          ↑
        </Button>
      </form>
      <form action={downAction}>
        <input type="hidden" name="briefId" value={briefId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="dir" value="down" />
        <Button type="submit" variant="outline" size="sm" aria-label="Move down" disabled={last || downPending}>
          ↓
        </Button>
      </form>
    </>
  );
}

function RateButtons({ item }: { item: BriefItemView }) {
  const [usefulState, usefulAction, usefulPending] = useActionState(rateItemAction, { ok: true } as FormResult);
  const [notUsefulState, notUsefulAction, notUsefulPending] = useActionState(rateItemAction, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <form action={usefulAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="useful" value="true" />
          <Button type="submit" variant="outline" size="sm" aria-label="Useful" disabled={usefulPending}>
            Useful
          </Button>
        </form>
        <form action={notUsefulAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="useful" value="false" />
          <Button type="submit" variant="outline" size="sm" aria-label="Not useful" disabled={notUsefulPending}>
            Not useful
          </Button>
        </form>
      </div>
      <Message state={usefulState} />
      <Message state={notUsefulState} />
    </div>
  );
}

/**
 * Item ids are exposed as `#item-<id>` anchors (matches `BriefView`, Task 15's email deep links scroll here too).
 * Active items can be edited/removed/reordered while the brief is `ready`; rating is always available for an
 * active item so the agency can tell the engine which recommendations landed, even after the brief is sent.
 */
export function ReviewItem({ briefId, item, editable, first, last }: { briefId: string; item: BriefItemView; editable: boolean; first: boolean; last: boolean }) {
  const dropped = item.status !== 'active';
  return (
    <article
      id={`item-${item.id}`}
      className={`rounded-r-[10px] border-l-[3px] bg-muted-surface px-3.5 py-3 ${item.confidence >= 0.85 ? 'border-amber' : 'border-primary'} ${dropped ? 'opacity-60' : ''}`}
    >
      <h3 className="mb-1.5 text-[15px] font-bold">{item.headline}</h3>
      <p className="my-1">
        <b>{item.competitorName}:</b> {item.whatChanged}
      </p>
      <p className="my-1">{item.whyItMatters}</p>
      <p className="my-1">
        <b className="text-secondary">Suggested:</b> {item.recommendedAction}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">{item.evidenceIds.length} evidence items</span>
        {item.upsellTag && <span className="rounded-md bg-[#FFF3DC] px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {item.upsellTag}</span>}
        {dropped && <Badge variant="outline">Dropped</Badge>}
        <span className="ml-auto rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Confidence {Math.round(item.confidence * 100)}%</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && !dropped && (
          <>
            <EditItemDialog briefId={briefId} item={item} />
            <RemoveItemDialog briefId={briefId} item={item} />
            <MoveButtons briefId={briefId} item={item} first={first} last={last} />
          </>
        )}
        {!dropped && <RateButtons item={item} />}
      </div>
    </article>
  );
}

/**
 * Fix round 1: matches the codebase's established pattern for action-backed switches (`WebhookToggle` in
 * `webhook-controls.tsx`, `PrefSwitch` in `pref-switch.tsx`) — `useOptimistic` + `useTransition`, calling the
 * server action directly with a `FormData` built from the new value, instead of submitting a real `<form>`.
 * `useOptimistic` shows `next` only while the transition is pending; if the action fails (no `revalidatePath`,
 * so the `autoSend` prop this component receives never changes) the optimistic value reverts to the original
 * `autoSend` once the transition settles, and the action's error is shown via `Message`. `isPending` both
 * disables the switch and is checked before starting a new transition, so a toggle mid-flight is ignored rather
 * than queued.
 */
function AutoSendSwitch({ briefId, clientId, autoSend }: { briefId: string; clientId: string; autoSend: boolean }) {
  const [checked, setChecked] = useOptimistic(autoSend);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch
          checked={checked}
          disabled={isPending}
          aria-label="Send untouched briefs automatically on Monday 07:00"
          onCheckedChange={(next: boolean) => {
            if (isPending) return;
            startTransition(async () => {
              setChecked(next);
              const fd = new FormData();
              fd.set('clientId', clientId);
              fd.set('briefId', briefId);
              fd.set('enabled', String(next));
              setResult(await autoSendAction({ ok: true }, fd));
            });
          }}
        />
        <span className="text-sm">Send untouched briefs automatically on Monday 07:00</span>
      </div>
      <Message state={result} />
    </div>
  );
}

function ApproveButton({ briefId }: { briefId: string }) {
  const [state, formAction, pending] = useActionState(approveAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="briefId" value={briefId} />
      <Button type="submit" disabled={pending}>
        Approve · send Mon 07:00
      </Button>
      <Message state={state} />
    </form>
  );
}

function SendNowDialog({ briefId }: { briefId: string }) {
  const [state, formAction, pending] = useActionState(sendNowAction, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Send now</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send now</DialogTitle>
          <DialogDescription>Send this brief to the client’s recipients now?</DialogDescription>
        </DialogHeader>
        <Message state={state} />
        <form action={formAction}>
          <input type="hidden" name="briefId" value={briefId} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Send now
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `status === 'ready'` is the only state that can still be approved; `ready` or `approved` can still be sent now. */
export function ReviewFooter({ briefId, clientId, status, autoSend }: { briefId: string; clientId: string; status: string; autoSend: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      <AutoSendSwitch briefId={briefId} clientId={clientId} autoSend={autoSend} />
      <div className="ml-auto flex items-center gap-3">
        {status === 'ready' && <ApproveButton briefId={briefId} />}
        {(status === 'ready' || status === 'approved') && <SendNowDialog briefId={briefId} />}
      </div>
    </div>
  );
}
