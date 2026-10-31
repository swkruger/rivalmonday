'use client';

import { Segmented } from '@cs/ui';
import { useState } from 'react';
import type { SampleEvidence } from '../../sample/schema';
import { formatDay } from '../../sample/format';

/**
 * Illustrative page images for the sample's snapshots (generated once, no text, people or brands; served from
 * `public/sample`), matched on the captured text so a re-export keeps the right picture. No match → no image.
 */
const PAGE_IMAGES: { test: RegExp; src: string; alt: string }[] = [
  { test: /heat pump/i, src: '/sample/site-heat-pump.webp', alt: 'A new heat pump unit installed beside a white house' },
  { test: /diagnostic|repair/i, src: '/sample/site-ac-diagnostic.webp', alt: 'An outdoor air conditioning unit with service gauges and a tool bag' },
];

/** The captured page as a small website: before/after switch, the changed block outlined (`ring-change`, never orange). */
export function SnapshotView({ ev }: { ev: Extract<SampleEvidence, { kind: 'snapshot' }> }) {
  const [view, setView] = useState<'before' | 'after'>('after');
  const lines = view === 'after' ? ev.after : ev.before;
  const was = ev.before[ev.changed];
  const now = ev.after[ev.changed];
  // Matched on the version on screen: a service the page didn't offer yet has no picture in "Before".
  const image = PAGE_IMAGES.find((p) => p.test.test(lines.join(' ')));
  return (
    <div className="flex flex-col gap-3">
      {now !== undefined && (
        <div data-slot="snapshot-diff" className="flex flex-col gap-1.5 rounded-md border border-line bg-canvas p-3 text-sm">
          {was !== undefined && (
            <p className="flex gap-2 text-ink-secondary">
              <span className="w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-ink">Before</span>
              <del className="decoration-line-strong">{was}</del>
            </p>
          )}
          <p className="flex gap-2 text-ink">
            <span className="w-12 shrink-0 text-xs font-medium uppercase tracking-wide text-secondary">After</span>
            <ins className="font-semibold no-underline">{now}</ins>
          </p>
        </div>
      )}
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
        <div className="flex items-center justify-between gap-3 bg-surface px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{ev.title}</p>
          {/* Page chrome sketched in grey so the captured text reads as part of a real page. */}
          <span aria-hidden="true" className="flex shrink-0 gap-1.5">
            <span className="h-2 w-8 rounded-full bg-muted-surface" />
            <span className="h-2 w-8 rounded-full bg-muted-surface" />
            <span className="h-2 w-8 rounded-full bg-muted-surface" />
          </span>
        </div>
        {image && (
          <img src={image.src} alt={image.alt} width={960} height={640} loading="lazy" decoding="async" className="aspect-[16/9] w-full bg-muted-surface object-cover" />
        )}
        <div className="flex flex-col gap-3 bg-surface p-4">
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
          <span aria-hidden="true" className="self-start rounded-xs bg-muted-surface-2 px-2.5 py-1 text-xs font-medium text-ink">Book now</span>
        </div>
        <figcaption className="sr-only">{`${view === 'after' ? 'After' : 'Before'} the change, captured ${formatDay(ev.capturedAt)}`}</figcaption>
      </figure>
    </div>
  );
}
