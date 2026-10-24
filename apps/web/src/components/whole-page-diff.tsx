import type { CaptureCompareView } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import type { ReactElement } from 'react';
import { formatDateTime } from '@/lib/format';

type Blocks = CaptureCompareView['blocks'];
type Block = Blocks[number];
export type DiffRun = { type: 'block'; block: Block } | { type: 'collapsed'; blocks: Blocks };

/** Runs of more than two unchanged blocks fold into one `<details>`; shorter runs stay visible for context. */
export function collapseUnchanged(blocks: Blocks): DiffRun[] {
  const out: DiffRun[] = [];
  let run: Blocks = [];
  const flush = () => {
    if (run.length > 2) out.push({ type: 'collapsed', blocks: run });
    else for (const b of run) out.push({ type: 'block', block: b });
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === 'unchanged') run.push(b);
    else {
      flush();
      out.push({ type: 'block', block: b });
    }
  }
  flush();
  return out;
}

const CHIP = { added: { tone: 'success', label: 'Added' }, removed: { tone: 'danger', label: 'Removed' }, modified: { tone: 'info', label: 'Changed' } } as const;

function Segments({ block }: { block: Block }) {
  return (
    <p className="text-sm leading-relaxed text-ink">
      {block.segments.map((s, i) =>
        s.op === 'insert' ? (
          <ins key={i} aria-label={`added: ${s.text}`} className="bg-chip-success-bg text-chip-success-text no-underline">
            {s.text}
          </ins>
        ) : s.op === 'delete' ? (
          <del key={i} aria-label={`removed: ${s.text}`} className="bg-chip-danger-bg text-chip-danger-text line-through">
            {s.text}
          </del>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function BlockRow({ block }: { block: Block }) {
  const chip = block.kind === 'unchanged' ? null : CHIP[block.kind];
  return (
    <div className="flex flex-col items-start gap-1 border-t border-line py-3 first:border-t-0">
      {chip && <StatusChip tone={chip.tone}>{chip.label}</StatusChip>}
      <Segments block={block} />
    </div>
  );
}

/** The whole-page diff (15c-2b §6): changed sections with chips, long unchanged stretches collapsed. Server component. */
export function WholePageDiff({ view, timezone }: { view: CaptureCompareView; timezone: string }): ReactElement {
  const notes: string[] = [];
  let body: ReactElement | null = null;
  if (view.state === 'first') notes.push('This is the first capture of this page, so there is nothing to compare yet.');
  else if (view.state === 'no_blocks' || view.state === 'not_web') notes.push('Comparison not available for this capture.');
  else {
    if (view.maskedCount > 0) notes.push(`${view.maskedCount} sections change on every visit and are hidden.`);
    if (view.truncated) notes.push('This page changed too much to compare word by word, so some sections show as removed and added in full.');
    if (!view.blocks.some((b) => b.kind !== 'unchanged')) notes.push('No differences on this page.');
    body = (
      <div className="flex flex-col">
        {collapseUnchanged(view.blocks).map((r, i) =>
          r.type === 'block' ? (
            <BlockRow key={i} block={r.block} />
          ) : (
            <details key={i} className="border-t border-line py-3 first:border-t-0">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{r.blocks.length} unchanged sections</summary>
              <div className="mt-2 flex flex-col">
                {r.blocks.map((b, j) => (
                  <BlockRow key={j} block={b} />
                ))}
              </div>
            </details>
          ),
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {view.before && <p className="text-sm text-muted-foreground">Compared with the capture from {formatDateTime(view.before.capturedAt, { tz: timezone, zoneLabel: true })}</p>}
      {notes.map((n) => (
        <p key={n} className="text-sm text-muted-foreground">
          {n}
        </p>
      ))}
      {body}
    </div>
  );
}
