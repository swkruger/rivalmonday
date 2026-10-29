'use client';

import { Segmented } from '@cs/ui';
import { useState } from 'react';
import type { SampleEvidence } from '../../sample/schema';
import { formatDay } from '../../sample/format';

/** A text mock of the captured page: before/after switch, the changed block outlined (`ring-change`, never orange). */
export function SnapshotView({ ev }: { ev: Extract<SampleEvidence, { kind: 'snapshot' }> }) {
  const [view, setView] = useState<'before' | 'after'>('after');
  const lines = view === 'after' ? ev.after : ev.before;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          aria-label="Snapshot version"
          value={view}
          onValueChange={(v) => setView(v === 'before' ? 'before' : 'after')}
          items={[{ value: 'before', label: 'Before' }, { value: 'after', label: 'After' }]}
        />
        <span className="text-xs text-muted-ink">captured {formatDay(ev.capturedAt)}</span>
      </div>
      <figure className="overflow-hidden rounded-md border border-line">
        <div className="flex items-center gap-2 border-b border-line bg-muted-surface px-3 py-1.5">
          <span aria-hidden="true" className="flex gap-1">
            <span className="size-2 rounded-full bg-line-control" />
            <span className="size-2 rounded-full bg-line-control" />
            <span className="size-2 rounded-full bg-line-control" />
          </span>
          <span className="min-w-0 truncate text-xs text-ink-secondary">{ev.url}</span>
        </div>
        <div className="flex flex-col gap-3 bg-surface p-4">
          <p className="text-sm font-semibold text-ink">{ev.title}</p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-ink">Nothing here in this version.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line, i) => (
                <li
                  key={`${view}-${i}`}
                  data-changed={i === ev.changed ? 'true' : undefined}
                  className={i === ev.changed ? 'ring-change rounded-xs px-2 py-1 text-sm text-ink' : 'px-2 py-1 text-sm text-ink-secondary'}
                >
                  {i === ev.changed && <span className="sr-only">Changed: </span>}
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <figcaption className="sr-only">{`${view === 'after' ? 'After' : 'Before'} the change, captured ${formatDay(ev.capturedAt)}`}</figcaption>
      </figure>
    </div>
  );
}
