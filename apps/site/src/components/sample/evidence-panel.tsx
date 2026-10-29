'use client';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, useMediaQuery } from '@cs/ui';
import { X } from 'lucide-react';
import { formatDay } from '../../sample/format';
import type { SampleBriefData, SampleEvidence } from '../../sample/schema';
import { AdView } from './ad-view';
import { ReviewsView } from './reviews-view';
import { SnapshotView } from './snapshot-view';

const host = (url: string) => {
  try { return new URL(url).hostname; } catch { return url; }
};

export function evidenceTitle(ev: SampleEvidence): string {
  switch (ev.kind) {
    case 'snapshot': return `Website snapshot · ${ev.url}`;
    case 'reviews': return `Google reviews · ${ev.count} new`;
    case 'ad': return `Ad · ${ev.platform === 'google' ? 'Google' : 'Meta'} Ad Library`;
    case 'rank': return `Map rankings · week of ${formatDay(ev.weekOf)}`;
  }
}

/** The short source a citation pill shows. */
export function evidenceSource(ev: SampleEvidence): { source: string; date: string } {
  switch (ev.kind) {
    case 'snapshot': return { source: host(ev.url), date: formatDay(ev.capturedAt) };
    case 'reviews': return { source: 'Google reviews', date: formatDay(ev.to) };
    case 'ad': return { source: `${ev.platform === 'google' ? 'Google' : 'Meta'} ad`, date: formatDay(ev.firstSeen) };
    case 'rank': return { source: 'Map rankings', date: formatDay(ev.weekOf) };
  }
}

function RankView({ ev }: { ev: Extract<SampleEvidence, { kind: 'rank' }> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-ink">Search</dt>
      <dd className="text-ink">&ldquo;{ev.keyword}&rdquo;</dd>
      <dt className="text-muted-ink">Week of</dt>
      <dd className="text-ink">{formatDay(ev.weekOf)}</dd>
      <dt className="text-muted-ink">Result</dt>
      <dd className="font-medium text-ink">{ev.summary}</dd>
    </dl>
  );
}

/**
 * The evidence sheet: right on desktop, bottom on phones. Radix traps focus while open and Escape / the backdrop /
 * the close button close it; focus goes back to `returnFocus` (the claim, pill or grid link that opened it).
 */
export function EvidencePanel({ ev, data, onClose, returnFocus }: {
  ev: SampleEvidence | null;
  data: SampleBriefData;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const phone = useMediaQuery('(max-width: 639px)');
  const side = phone ? 'bottom' : 'right';
  const rival = ev && 'rivalId' in ev ? data.rivals.find((r) => r.id === ev.rivalId)?.name : undefined;
  return (
    <Sheet open={ev !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {ev && (
        <SheetContent
          side={side}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus()?.focus(); }}
          className={side === 'right' ? 'sheet-in-right w-[440px] max-w-[92vw] gap-4 px-5' : 'sheet-in-bottom gap-4 px-4'}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <SheetTitle className="text-base break-words">{evidenceTitle(ev)}</SheetTitle>
              {rival && <p className="text-sm text-muted-ink">{rival}</p>}
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close evidence">
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
          {ev.kind === 'snapshot' && <SnapshotView ev={ev} />}
          {ev.kind === 'reviews' && <ReviewsView ev={ev} />}
          {ev.kind === 'ad' && <AdView ev={ev} />}
          {ev.kind === 'rank' && <RankView ev={ev} />}
          <p className="mt-auto text-xs text-muted-ink">Sample data · All businesses, people and places are fictional.</p>
        </SheetContent>
      )}
    </Sheet>
  );
}
