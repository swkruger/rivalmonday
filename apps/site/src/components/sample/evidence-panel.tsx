'use client';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, StatusChip, TierMark, useMediaQuery } from '@cs/ui';
import { Globe, Map, Megaphone, Star, X, type LucideIcon } from 'lucide-react';
import { formatDay } from '../../sample/format';
import type { SampleBriefData, SampleEvidence } from '../../sample/schema';
import { AdView } from './ad-view';
import { RankMap } from './rank-map';
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

const shortDay = (value: string) => formatDay(value).replace(/, \d{4}$/, '');

/** The short source a citation pill shows; distinct per evidence, so two pills side by side never read the same. */
export function evidenceSource(ev: SampleEvidence): { source: string; date: string } {
  switch (ev.kind) {
    case 'snapshot': return { source: host(ev.url), date: formatDay(ev.capturedAt) };
    case 'reviews': return { source: 'Google reviews', date: formatDay(ev.to) };
    case 'ad': return { source: `${ev.platform === 'google' ? 'Google' : 'Meta'} ad: ${ev.headline}`, date: formatDay(ev.firstSeen) };
    case 'rank': return { source: `Map scan, ${shortDay(ev.weekOf)}`, date: formatDay(ev.weekOf) };
  }
}

const KIND: Record<SampleEvidence['kind'], { label: string; Icon: LucideIcon }> = {
  snapshot: { label: 'Website snapshot', Icon: Globe },
  reviews: { label: 'Google reviews', Icon: Star },
  ad: { label: 'Ad library', Icon: Megaphone },
  rank: { label: 'Map scan', Icon: Map },
};

const share = (summary: string) => {
  const m = /top 3 in (\d+) of (\d+)/.exec(summary);
  return m ? { n: Number(m[1]), of: Number(m[2]) } : null;
};

function Meter({ label, n, of, strong }: { label: string; n: number; of: number; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className={`tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>{n} of {of} points</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted-surface">
        <div className={`h-full rounded-full ${strong ? 'bg-secondary' : 'bg-chart-context'}`} style={{ width: `${(n / of) * 100}%` }} />
      </div>
    </div>
  );
}

function RankView({ ev, data }: { ev: Extract<SampleEvidence, { kind: 'rank' }>; data: SampleBriefData }) {
  const mine = ev.summary.startsWith('You:');
  const week = data.rankGrid.weeks.find((w) => w.weekOf === ev.weekOf);
  const now = share(ev.summary);
  // The same business's earlier scan, when the sample has one: the "before" of this claim.
  const who = ev.summary.split(':')[0];
  const earlier = Object.values(data.evidence)
    .filter((e): e is typeof ev => e.kind === 'rank' && e.keyword === ev.keyword && e.weekOf < ev.weekOf && e.summary.split(':')[0] === who)
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
  const before = earlier ? share(earlier.summary) : null;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-ink">Search</dt>
        <dd className="text-ink">&ldquo;{ev.keyword}&rdquo;</dd>
        <dt className="text-muted-ink">Business</dt>
        <dd className="text-ink">{mine ? data.business.name : who}</dd>
      </dl>
      {mine && week ? (
        <div className="mx-auto w-full max-w-72">
          <RankMap ranks={week.you} size={data.rankGrid.size} compact />
        </div>
      ) : null}
      {now && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-3">
          <p className="text-13 font-medium text-ink">Points where it ranks in the map top 3</p>
          {before && earlier && <Meter label={`Week of ${formatDay(earlier.weekOf)}`} n={before.n} of={before.of} />}
          <Meter label={`Week of ${formatDay(ev.weekOf)}`} n={now.n} of={now.of} strong />
        </div>
      )}
    </div>
  );
}

/** Each step of how this evidence reached the brief, oldest first. */
function trail(ev: SampleEvidence, data: SampleBriefData): { title: string; detail: string }[] {
  const capture = (() => {
    switch (ev.kind) {
      case 'snapshot': return { title: 'Captured', detail: `${host(ev.url)} · ${formatDay(ev.capturedAt)}` };
      case 'reviews': return { title: 'Collected', detail: `Google reviews · ${formatDay(ev.from)} to ${formatDay(ev.to)}` };
      case 'ad': return { title: 'Found', detail: `${ev.platform === 'google' ? 'Google Ads Transparency Center' : 'Meta Ad Library'} · first seen ${formatDay(ev.firstSeen)}` };
      case 'rank': return { title: 'Scanned', detail: `${data.rankGrid.size * data.rankGrid.size} map points · week of ${formatDay(ev.weekOf)}` };
    }
  })();
  const compare = ev.kind === 'snapshot' ? 'Compared with the previous capture: 1 change' : ev.kind === 'rank' ? 'Compared with earlier scans' : 'New since the previous check';
  return [
    capture,
    { title: 'Compared', detail: compare },
    { title: 'Checked', detail: 'The claim was checked against this evidence' },
    { title: 'Briefed', detail: `Monday brief, week of ${formatDay(data.weekOf)}` },
  ];
}

/** The brief claim this evidence backs, if the sample has one. */
function claimFor(ev: SampleEvidence, data: SampleBriefData): string | null {
  const item = data.items.find((i) => i.evidenceIds.includes(ev.id));
  if (item) return item.whatChanged;
  return ev.kind === 'rank' ? ev.summary : null;
}

/**
 * The evidence sheet: right on desktop, bottom on phones. Radix traps focus while open and Escape / the backdrop /
 * the close button close it; focus goes back to `returnFocus` (the claim, pill or grid link that opened it).
 * Reads top to bottom as: what it is → the claim it backs → the evidence itself → how it got into the brief.
 */
export function EvidencePanel({ ev, data, onClose, returnFocus }: {
  ev: SampleEvidence | null;
  data: SampleBriefData;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const phone = useMediaQuery('(max-width: 639px)');
  const side = phone ? 'bottom' : 'right';
  const rival = ev && 'rivalId' in ev ? data.rivals.find((r) => r.id === ev.rivalId) : undefined;
  const kind = ev ? KIND[ev.kind] : null;
  const claim = ev ? claimFor(ev, data) : null;
  return (
    <Sheet open={ev !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {ev && kind && (
        <SheetContent
          side={side}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus()?.focus(); }}
          className={side === 'right' ? 'sheet-in-right w-[480px] max-w-[94vw] gap-0 overflow-y-auto p-0' : 'sheet-in-bottom max-h-[88vh] gap-0 overflow-y-auto p-0'}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line bg-canvas px-5 py-4">
            <div className="flex min-w-0 gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-secondary">
                <kind.Icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{kind.label}</p>
                <SheetTitle className="text-base break-words">{evidenceTitle(ev)}</SheetTitle>
                {rival && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                    {rival.name} <TierMark tier={rival.tier} />
                  </p>
                )}
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close evidence">
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>

          <div className="flex flex-col gap-6 px-5 py-5">
            {claim && (
              <section aria-label="The claim" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-13 font-semibold text-ink">The claim this backs</h3>
                  <StatusChip tone="success">Matches the evidence</StatusChip>
                </div>
                <blockquote className="border-l-2 border-secondary pl-3 text-sm text-ink">{claim}</blockquote>
              </section>
            )}

            <section aria-label="The evidence" className="flex flex-col gap-2">
              <h3 className="text-13 font-semibold text-ink">The evidence</h3>
              {ev.kind === 'snapshot' && <SnapshotView ev={ev} />}
              {ev.kind === 'reviews' && <ReviewsView ev={ev} />}
              {ev.kind === 'ad' && <AdView ev={ev} advertiser={rival?.name ?? 'Advertiser'} />}
              {ev.kind === 'rank' && <RankView ev={ev} data={data} />}
            </section>

            <section aria-label="Evidence trail" className="flex flex-col gap-3">
              <h3 className="text-13 font-semibold text-ink">How it reached the brief</h3>
              <ol className="flex flex-col">
                {trail(ev, data).map((s, i, all) => (
                  <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < all.length - 1 && <span aria-hidden="true" className="absolute left-[0.6875rem] top-6 bottom-0 w-px bg-line" />}
                    <span aria-hidden="true" className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-secondary bg-surface text-xs font-semibold text-secondary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">{s.title}</p>
                      <p className="text-ink-secondary">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <p className="mt-auto border-t border-line px-5 py-3 text-xs text-muted-ink">
            Sample data · All businesses, people and places are fictional{ev.kind === 'ad' ? '; ad images are illustrations' : ''}.
          </p>
        </SheetContent>
      )}
    </Sheet>
  );
}
