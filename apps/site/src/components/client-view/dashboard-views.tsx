'use client';

import { TierMark } from '@cs/ui';
import { ChevronRight } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { formatDay } from '../../sample/format';
import { SAMPLE, type SampleEvidence } from '../../sample/schema';
import { BriefItems, type OpenEvidence } from '../sample/brief-items';
import { RankGrid } from '../sample/rank-grid';
import { ReviewsView } from '../sample/reviews-view';
import { AdActivityChart } from './ad-activity-chart';

/** What the menu's other pages show: the same sample as the overview, and every claim still opens its evidence. */
const firstEvidence = (rivalId: string) => SAMPLE.items.find((i) => i.rivalId === rivalId)?.evidenceIds[0];

function Page({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        <p className="text-13 text-ink-secondary">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function BriefsView({ onOpen }: { onOpen: OpenEvidence }) {
  return (
    <Page title="Monday briefs" sub={`Week of ${formatDay(SAMPLE.weekOf)} · ${SAMPLE.items.length} changes`}>
      <BriefItems items={SAMPLE.items} data={SAMPLE} onOpen={onOpen} />
    </Page>
  );
}

export function CompetitorsView({ onOpen, onAds }: { onOpen: OpenEvidence; onAds: () => void }) {
  return (
    <Page title="Competitors" sub={`Tracking ${SAMPLE.rivals.length} competitors`}>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {SAMPLE.rivals.map((r) => {
          const pressure = CLIENT_VIEW.pressure.find((p) => p.name === r.name);
          const evidence = firstEvidence(r.id);
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-13 font-semibold text-ink">{r.name}</span>
                  <TierMark tier={r.tier} />
                </span>
                <span className="block text-xs text-ink-secondary">{pressure?.reason ?? CLIENT_VIEW.quietRival}</span>
              </span>
              {pressure && (
                <span className="shrink-0 text-xs text-ink-secondary">
                  Pressure <b className="text-sm font-semibold tabular-nums text-ink">{pressure.score}</b>
                </span>
              )}
            </>
          );
          const onClick = evidence ? (e: React.MouseEvent<HTMLElement>) => onOpen(evidence, e.currentTarget) : pressure ? onAds : null;
          return (
            <li key={r.id}>
              {onClick ? (
                <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas">
                  {body}
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-ink" />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

export function MapView({ onOpen }: { onOpen: OpenEvidence }) {
  return (
    <Page title="Map rankings" sub={`"${SAMPLE.rankGrid.keyword}" · ${SAMPLE.rankGrid.size * SAMPLE.rankGrid.size} points across the service area`}>
      <div className="w-full max-w-md">
        <RankGrid data={SAMPLE} onOpen={onOpen} />
      </div>
    </Page>
  );
}

export function AdsView({ onOpen }: { onOpen: OpenEvidence }) {
  const ads = Object.values(SAMPLE.evidence).filter((e): e is Extract<SampleEvidence, { kind: 'ad' }> => e.kind === 'ad');
  const weeks = SAMPLE.rankGrid.weeks.map((w) => w.weekOf);
  return (
    <Page title="Ads" sub={`${ads.length} new this week`}>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {ads.map((ad) => (
          <li key={ad.id}>
            <button type="button" aria-haspopup="dialog" onClick={(e) => onOpen(ad.id, e.currentTarget)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas">
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-semibold text-ink">{ad.headline}</span>
                <span className="block text-xs text-ink-secondary">{ad.body}</span>
                <span className="block text-xs text-muted-ink">
                  {SAMPLE.rivals.find((r) => r.id === ad.rivalId)?.name} · first seen {formatDay(ad.firstSeen)}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-ink" />
            </button>
          </li>
        ))}
      </ul>
      <section className="flex max-w-2xl flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink">Competitor ad activity</h4>
        <AdActivityChart weeks={weeks} series={CLIENT_VIEW.ads} />
      </section>
    </Page>
  );
}

function RatingBar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-13">
        <span className="text-ink-secondary">{label}</span>
        <span className={`tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink-secondary'}`}>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted-surface">
        <div className={`h-full rounded-full ${strong ? 'bg-secondary' : 'bg-chart-context'}`} style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

export function ReviewsPane() {
  const { rating, area, rival, from, to, reviews } = CLIENT_VIEW.reviews;
  return (
    <Page title="Reviews" sub={`Your rating ${rating.toFixed(1)} · area average ${area.toFixed(1)}`}>
      <div className="flex max-w-md flex-col gap-3 rounded-md border border-line p-3">
        <RatingBar label={SAMPLE.business.name} value={rating} strong />
        <RatingBar label="Area average" value={area} />
      </div>
      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-ink">New reviews of {rival}</h4>
        <ReviewsView ev={{ id: 'sample-reviews', kind: 'reviews', rivalId: 'sample', from, to, count: reviews.length, reviews: [...reviews] }} />
      </section>
    </Page>
  );
}
