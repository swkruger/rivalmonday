'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label, StatusChip, textareaClass } from '@cs/ui';
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
        <Button type="button" variant="outline" size="sm" aria-label={`Dismiss ${rec.title}`}>Dismiss</Button>
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
            <section key={status} aria-label={REC_COPY.columns[status]} className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-ink">{REC_COPY.columns[status]} ({items.length})</h3>
              {items.length === 0 && <p className="text-sm text-muted-ink">{REC_COPY.empty}</p>}
              {items.map((rec) => {
                const meta = SAMPLE_REC_META[rec.id]!;
                return (
                  <article key={`${rec.id}-${rec.status}`} data-rec={rec.id} tabIndex={-1} className="reveal-quick rounded-md border border-line bg-surface p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <p className="text-sm font-semibold text-ink">{rec.title}</p>
                    <p className="mt-1 text-sm text-ink-secondary">{rec.rationale}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <StatusChip tone="neutral">Effort: {meta.effort}</StatusChip>
                      <StatusChip tone="neutral">Impact: {meta.impact}</StatusChip>
                      <StatusChip tone="neutral">{REC_COPY.owner[meta.owner]}</StatusChip>
                      <StatusChip tone="neutral">{REC_COPY.source}</StatusChip>
                      <EvidencePills ids={rec.evidenceIds} data={SAMPLE} onOpen={openEvidence} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {rec.status === 'done' ? (
                        <Button type="button" variant="outline" size="sm" aria-label={`Reopen ${rec.title}`} onClick={() => move(rec, 'in_progress')}>Reopen</Button>
                      ) : (
                        <>
                          {targetsFor(rec.status, rec.title).map((t) => (
                            <Button key={t.status} type="button" variant="outline" size="sm" aria-label={t.aria} onClick={() => move(rec, t.status)}>{t.label}</Button>
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
                <Button type="button" variant="outline" size="sm" aria-label={`Reopen ${rec.title}`} onClick={() => move(rec, 'todo')}>Reopen</Button>
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
