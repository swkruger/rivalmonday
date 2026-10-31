'use client';

import { FridayBadge, StatusChip } from '@cs/ui';
import { Bell, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { CLIENT_VIEW, type DashboardOpen, type DashboardView } from '../../../content/client-view';
import { formatDay } from '../../sample/format';
import { SAMPLE } from '../../sample/schema';
import { useCountUp, useInView } from '../motion/in-view';
import { EvidencePanel } from '../sample/evidence-panel';
import { AdActivityChart } from './ad-activity-chart';
import { AdsView, BriefsView, CompetitorsView, MapView, ReviewsPane } from './dashboard-views';
import { NoteMark } from './note-mark';

const LEVEL_LABEL = { high: 'High', elevated: 'Elevated', low: 'Low' } as const;

type Follow = (to: DashboardOpen, el: HTMLElement) => void;

function Kpi({ label, value, decimals, caption, open, active, onFollow }: { label: string; value: number; decimals: number; caption: string; open: DashboardOpen; active: boolean; onFollow: Follow }) {
  const shown = useCountUp(value, active);
  return (
    <button type="button" onClick={(e) => onFollow(open, e.currentTarget)} className="group flex min-w-0 flex-col gap-1 bg-surface px-4 py-3 text-left hover:bg-canvas">
      <span className="flex items-center justify-between gap-1">
        <span className="min-w-0 text-xs text-ink-secondary">{label}</span>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-ink group-hover:text-secondary" />
      </span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{shown.toFixed(decimals)}</span>
      <span className="truncate text-xs text-muted-ink">{caption}</span>
    </button>
  );
}

function Overview({ seen, onFollow, onView, onOpen }: { seen: boolean; onFollow: Follow; onView: (v: DashboardView) => void; onOpen: (id: string, el: HTMLElement) => void }) {
  const latest = SAMPLE.items.slice(0, 2);
  const weeks = SAMPLE.rankGrid.weeks.map((w) => w.weekOf);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-ink">Overview</h3>
        <p className="text-13 text-ink-secondary">
          Tracking {SAMPLE.rivals.length} competitors · Brief for the week of {formatDay(SAMPLE.weekOf)}
        </p>
      </div>

      {/* Hairlines from a 1 px gap over the line colour; each cell paints the surface. */}
      <div className="relative">
        <span className="absolute -left-2.5 -top-2.5 z-10"><NoteMark n={1} /></span>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4">
          {CLIENT_VIEW.kpis.map((k) => <Kpi key={k.label} {...k} active={seen} onFollow={onFollow} />)}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">Latest brief</h4>
              <button type="button" onClick={() => onView('briefs')} className="text-xs font-medium text-link hover:underline">{CLIENT_VIEW.seeAll}</button>
            </div>
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {latest.map((item) => (
                <li key={item.id}>
                  <button type="button" aria-haspopup="dialog" onClick={(e) => onOpen(item.evidenceIds[0]!, e.currentTarget)} className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-canvas">
                    <span className="text-13 font-semibold text-ink">{item.headline}</span>
                    <span className="text-xs text-ink-secondary">{item.whyItMatters}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">Competitor ad activity <NoteMark n={3} /></h4>
              <button type="button" onClick={() => onView('ads')} className="text-xs font-medium text-link hover:underline">{CLIENT_VIEW.seeAds}</button>
            </div>
            <AdActivityChart weeks={weeks} series={CLIENT_VIEW.ads} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">Competitive pressure <NoteMark n={2} /></h4>
            <ul className="flex flex-col gap-1">
              {CLIENT_VIEW.pressure.map((p, i) => (
                <li key={p.name}>
                  <button type="button" onClick={(e) => onFollow(p.open, e.currentTarget)} className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-sm px-1.5 py-1 text-left hover:bg-canvas">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-13 font-semibold text-ink">{p.name}</span>
                      <span className="shrink-0 text-xs text-ink-secondary">
                        {LEVEL_LABEL[p.level]} · <b className="font-semibold tabular-nums text-ink">{p.score}</b>
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-ink">{p.reason}</span>
                    <span role="img" aria-label={`Competitive pressure ${p.score} of 100, ${p.level}`} className="mt-1 block h-2 overflow-hidden rounded-full bg-muted-surface">
                      <span className="grow-bar block h-2 rounded-full bg-secondary" style={{ width: `${p.score}%`, transitionDelay: `${i * 90}ms` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-ink">Recent alerts</h4>
            <ul className="flex flex-col gap-1">
              {CLIENT_VIEW.alerts.map((a) => (
                <li key={a.title}>
                  <button type="button" aria-haspopup="dialog" onClick={(e) => onOpen(a.evidence, e.currentTarget)} className="-mx-1.5 flex w-[calc(100%+0.75rem)] gap-2.5 rounded-sm px-1.5 py-1 text-left text-13 hover:bg-canvas">
                    <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span className="min-w-0">
                      <span className="block text-ink">{a.title}</span>
                      <span className="block text-xs text-muted-ink">{formatDay(a.date)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <span className="self-start"><StatusChip tone="info">Sample data</StatusChip></span>
        </div>
      </div>
    </div>
  );
}

/**
 * The client's dashboard, recreated with sample data (mirrors apps/web `c/[clientId]/page.tsx`). It works like the real
 * one: the menu switches pages, and numbers, rivals and alerts lead to the page or evidence sheet behind them.
 */
export function DashboardMock({ view, onView, onAskFriday }: { view: DashboardView; onView: (v: DashboardView) => void; onAskFriday: () => void }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = (id: string, el: HTMLElement) => {
    trigger.current = el;
    setOpenId(id);
  };
  const follow: Follow = (to, el) => {
    if ('evidence' in to) open(to.evidence, el);
    else onView(to.view);
  };
  return (
    <div ref={ref} data-drawn={seen ? '' : undefined} className="flex min-h-0 flex-col bg-surface md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-b border-line bg-canvas p-2 md:w-48 md:border-b-0 md:border-r md:p-3">
        <span className="mb-3 hidden h-9 items-center justify-center rounded-md border border-dashed border-line-control text-xs font-medium text-muted-ink md:flex">
          {CLIENT_VIEW.agency.logo}
        </span>
        <nav aria-label="Client menu (sample)" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {CLIENT_VIEW.nav.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => onView(item.id)}
              className={`shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-left text-13 ${view === item.id ? 'bg-surface font-semibold text-ink' : 'text-ink-secondary hover:bg-surface hover:text-ink'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" onClick={onAskFriday} aria-label="Ask Friday" className="mt-3 hidden self-start md:block">
          <FridayBadge />
        </button>
      </aside>

      {view === 'overview' && <Overview seen={seen} onFollow={follow} onView={onView} onOpen={open} />}
      {view === 'briefs' && <BriefsView onOpen={open} />}
      {view === 'competitors' && <CompetitorsView onOpen={open} onAds={() => onView('ads')} />}
      {view === 'map' && <MapView onOpen={open} />}
      {view === 'ads' && <AdsView onOpen={open} />}
      {view === 'reviews' && <ReviewsPane />}

      <EvidencePanel ev={openId ? SAMPLE.evidence[openId] ?? null : null} data={SAMPLE} onClose={() => setOpenId(null)} returnFocus={() => trigger.current} />
    </div>
  );
}
