'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label, StatusChip, textareaClass } from '@cs/ui';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { REC_COPY, SAMPLE_REC_META, type RecStatus } from '../../../content/sample-recommendations';
import { SAMPLE } from '../../sample/schema';
import { EvidencePills, type OpenEvidence } from './brief-items';
import { EvidencePanel } from './evidence-panel';

type Rec = { id: string; title: string; rationale: string; evidenceIds: string[]; status: RecStatus; reason: string | null };

const initialRecs = (): Rec[] =>
  SAMPLE.items.flatMap((item) => {
    const meta = SAMPLE_REC_META[item.id];
    return meta ? [{ id: item.id, title: item.recommendedAction, rationale: item.whyItMatters, evidenceIds: item.evidenceIds, status: meta.status, reason: null }] : [];
  });

const COLUMNS = ['todo', 'in_progress', 'done'] as const;

/** D14 canvas styling: each lane a tinted panel with a coloured dot; chips tinted by meaning (all text pairs >= 4.5:1). */
const LANE: Record<(typeof COLUMNS)[number], { panel: string; dot: string }> = {
  todo: { panel: 'bg-muted-surface', dot: 'bg-line-strong' },
  in_progress: { panel: 'bg-chip-info-bg', dot: 'bg-primary' },
  done: { panel: 'bg-chip-success-bg', dot: 'bg-success' },
};
const CHIP = 'px-2 font-semibold';
const IMPACT: Record<string, string> = {
  High: 'bg-chip-danger-bg text-chip-danger-text',
  Medium: 'bg-chip-warning-bg text-chip-warning-text',
  Low: 'bg-chip-neutral-bg text-chip-neutral-text',
};
const OWNER: Record<'client' | 'agency', string> = { agency: 'bg-chip-info-bg text-chip-info-text', client: 'bg-amber-tint text-amber-text' };

/** Button look per move: Start is the filled ink step; Done is filled green where it is the next step (In progress). */
function moveClass(from: RecStatus, to: RecStatus): string {
  if (from === 'todo' && to === 'in_progress') return 'rec-btn rec-btn-ink';
  if (from === 'in_progress' && to === 'done') return 'rec-btn rec-btn-success';
  return 'rec-btn';
}

/** The same quick actions as the app's board for each column. */
function targetsFor(status: RecStatus, title: string): { status: RecStatus; label: string; aria: string }[] {
  if (status === 'todo') return [{ status: 'in_progress', label: 'Start', aria: `Start ${title}` }, { status: 'done', label: 'Done', aria: `Mark ${title} done` }];
  if (status === 'in_progress') return [{ status: 'done', label: 'Done', aria: `Mark ${title} done` }, { status: 'todo', label: 'Back to to-do', aria: `Move ${title} back to to-do` }];
  return [];
}

function DismissDialog({ rec, onDismiss }: { rec: Rec; onDismiss: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="rec-btn rec-btn-quiet" aria-label={`Dismiss ${rec.title}`}>Dismiss</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{REC_COPY.dismissTitle(rec.title)}</DialogTitle>
          <DialogDescription>{REC_COPY.dismissBody}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            setOpen(false);
            onDismiss(reason.trim());
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${rec.id}`}>{REC_COPY.reasonLabel}</Label>
            <textarea id={`reason-${rec.id}`} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={!reason.trim()}>Dismiss</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The app's Recommendations board with the sample's items. It works like the real one, but only in this page: buttons move
 * cards between columns, Dismiss asks for a reason, and evidence pills open the same sheet as the brief. A moved card takes
 * keyboard focus, because the button that moved it is gone, and the live region says where it went.
 */
export function SampleRecommendations() {
  const [recs, setRecs] = useState<Rec[]>(initialRecs);
  const [moved, setMoved] = useState<{ id: string; message: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (moved) root.current?.querySelector<HTMLElement>(`[data-rec="${moved.id}"]`)?.focus();
  }, [moved]);

  const openEvidence: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  const move = (rec: Rec, status: RecStatus, reason: string | null = null) => {
    setRecs((all) => all.map((r) => (r.id === rec.id ? { ...r, status, reason } : r)));
    const where = status === 'dismissed' ? 'Dismissed' : `Moved to ${REC_COPY.columns[status]}`;
    setMoved({ id: rec.id, message: `${where}: ${rec.title}` });
  };
  const dismissed = recs.filter((r) => r.status === 'dismissed');
  const changed = recs.some((r) => r.status !== SAMPLE_REC_META[r.id]?.status);

  return (
    <div ref={root} data-slot="sample-recommendations">
      <div className="grid gap-6 lg:grid-cols-3">
        {COLUMNS.map((status) => {
          const items = recs.filter((r) => r.status === status);
          return (
            <section key={status} aria-label={REC_COPY.columns[status]} className={`flex min-w-0 flex-col gap-3 self-start rounded-frame p-3.5 ${LANE[status].panel}`}>
              <h3 className="flex items-center gap-2 px-2 py-1.5 text-sm font-bold text-ink">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${LANE[status].dot}`} />
                {REC_COPY.columns[status]} ({items.length})
              </h3>
              {items.length === 0 && <p className="text-sm text-muted-ink">{REC_COPY.empty}</p>}
              {items.map((rec) => {
                const meta = SAMPLE_REC_META[rec.id]!;
                return (
                  <article key={`${rec.id}-${rec.status}`} data-rec={rec.id} tabIndex={-1} data-lane={rec.status} className="rec-card reveal-quick p-4.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <p className="flex gap-2 text-sm font-semibold text-ink">
                      {rec.status === 'done' && <Check aria-hidden="true" strokeWidth={2.6} className="mt-0.5 size-4.5 shrink-0 text-success" />}
                      {rec.title}
                    </p>
                    <p className="mt-1 text-13 text-muted-ink">{rec.rationale}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <StatusChip tone="neutral" className={CHIP}>Effort: {meta.effort}</StatusChip>
                      <StatusChip tone="neutral" className={`${CHIP} ${IMPACT[meta.impact]}`}>Impact: {meta.impact}</StatusChip>
                      <StatusChip tone="neutral" className={`${CHIP} ${OWNER[meta.owner]}`}>{REC_COPY.owner[meta.owner]}</StatusChip>
                      <StatusChip tone="neutral" className={`${CHIP} bg-chip-info-bg text-chip-info-text`}>{REC_COPY.source}</StatusChip>
                      <EvidencePills ids={rec.evidenceIds} data={SAMPLE} onOpen={openEvidence} />
                    </div>
                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                      {rec.status === 'done' ? (
                        <Button type="button" variant="outline" className="rec-btn" aria-label={`Reopen ${rec.title}`} onClick={() => move(rec, 'in_progress')}>Reopen</Button>
                      ) : (
                        <>
                          {targetsFor(rec.status, rec.title).map((t) => (
                            <Button key={t.status} type="button" variant="outline" className={moveClass(rec.status, t.status)} aria-label={t.aria} onClick={() => move(rec, t.status)}>{t.label}</Button>
                          ))}
                          <DismissDialog rec={rec} onDismiss={(reason) => move(rec, 'dismissed', reason)} />
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      {dismissed.length > 0 && (
        <details open className="mt-6 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{REC_COPY.dismissedLabel(dismissed.length)}</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {dismissed.map((rec) => (
              <li key={rec.id} data-rec={rec.id} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-sm outline-none">
                <span className="font-semibold text-ink">{rec.title}</span>
                <span className="text-muted-ink">{rec.reason}</span>
                <Button type="button" variant="outline" className="rec-btn" aria-label={`Reopen ${rec.title}`} onClick={() => move(rec, 'todo')}>Reopen</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-13 text-muted-ink">
        <p>{REC_COPY.note}</p>
        {changed && (
          <button
            type="button"
            className="font-medium text-link hover:underline"
            onClick={() => {
              setRecs(initialRecs());
              setMoved(null);
            }}
          >
            {REC_COPY.reset}
          </button>
        )}
      </div>
      <p aria-live="polite" className="sr-only">{moved?.message ?? ''}</p>
      <EvidencePanel ev={openId ? SAMPLE.evidence[openId] ?? null : null} data={SAMPLE} onClose={() => setOpenId(null)} returnFocus={() => trigger.current} />
    </div>
  );
}
