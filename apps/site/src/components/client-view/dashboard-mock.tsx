'use client';

import { FridayBadge, StatusChip } from '@cs/ui';
import { Bell } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { formatDay } from '../../sample/format';
import { SAMPLE } from '../../sample/schema';
import { useCountUp, useInView } from '../motion/in-view';
import { AdActivityChart } from './ad-activity-chart';
import { NoteMark } from './note-mark';

const LEVEL_LABEL = { high: 'High', elevated: 'Elevated', low: 'Low' } as const;

function Kpi({ label, value, decimals, caption, active }: { label: string; value: number; decimals: number; caption: string; active: boolean }) {
  const shown = useCountUp(value, active);
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <p className="truncate text-xs text-ink-secondary">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-ink">{shown.toFixed(decimals)}</p>
      <p className="truncate text-xs text-muted-ink">{caption}</p>
    </div>
  );
}

/**
 * The client's overview page, recreated with sample data (mirrors apps/web `c/[clientId]/page.tsx`: KPI strip,
 * latest brief, Ask, competitive pressure, alerts, ad activity). Static markup plus scroll-triggered motion.
 */
export function DashboardMock() {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  const latest = SAMPLE.items.slice(0, 2);
  const weeks = SAMPLE.rankGrid.weeks.map((w) => w.weekOf);
  return (
    <div ref={ref} data-drawn={seen ? '' : undefined} className="flex min-h-0 bg-surface">
      <aside aria-label="Client menu (sample)" className="hidden w-48 shrink-0 flex-col gap-1 border-r border-line bg-canvas p-3 md:flex">
        <span className="mb-3 flex h-9 items-center justify-center rounded-md border border-dashed border-line-control text-xs font-medium text-muted-ink">
          {CLIENT_VIEW.agency.logo}
        </span>
        {CLIENT_VIEW.nav.map((item, i) => (
          <span key={item} className={`rounded-sm px-2.5 py-1.5 text-13 ${i === 0 ? 'bg-surface font-semibold text-ink' : 'text-ink-secondary'}`}>
            {item}
          </span>
        ))}
        <span className="mt-3 self-start"><FridayBadge /></span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold text-ink">Overview</p>
          <p className="text-13 text-ink-secondary">
            Tracking {SAMPLE.rivals.length} competitors · Brief for the week of {formatDay(SAMPLE.weekOf)}
          </p>
        </div>

        {/* Hairlines from a 1 px gap over the line colour; each cell paints the surface. */}
        <div className="relative">
          <span className="absolute -left-2.5 -top-2.5 z-10"><NoteMark n={1} /></span>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4 [&>*]:bg-surface">
            {CLIENT_VIEW.kpis.map((k) => <Kpi key={k.label} {...k} active={seen} />)}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-ink">Latest brief</h4>
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                {latest.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 px-3 py-2.5">
                    <p className="text-13 font-semibold text-ink">{item.headline}</p>
                    <p className="text-xs text-ink-secondary">{item.whyItMatters}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">Competitor ad activity <NoteMark n={3} /></h4>
                <span className="text-xs text-muted-ink">12 weeks</span>
              </div>
              <AdActivityChart weeks={weeks} series={CLIENT_VIEW.ads} />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">Competitive pressure <NoteMark n={2} /></h4>
              <ul className="flex flex-col gap-3">
                {CLIENT_VIEW.pressure.map((p, i) => (
                  <li key={p.name}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-13 font-semibold text-ink">{p.name}</span>
                      <span className="shrink-0 text-xs text-ink-secondary">
                        {LEVEL_LABEL[p.level]} · <b className="font-semibold tabular-nums text-ink">{p.score}</b>
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-ink">{p.reason}</p>
                    <div role="img" aria-label={`Competitive pressure ${p.score} of 100, ${p.level}`} className="mt-1 h-2 overflow-hidden rounded-full bg-muted-surface">
                      <div className="grow-bar h-2 rounded-full bg-secondary" style={{ width: `${p.score}%`, transitionDelay: `${i * 90}ms` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-ink">Recent alerts</h4>
              <ul className="flex flex-col gap-2">
                {CLIENT_VIEW.alerts.map((a) => (
                  <li key={a.title} className="flex gap-2.5 text-13">
                    <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
                    <span className="min-w-0">
                      <span className="text-ink">{a.title}</span>
                      <span className="block text-xs text-muted-ink">{formatDay(a.date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <StatusChip tone="info">Sample data</StatusChip>
          </div>
        </div>
      </div>
    </div>
  );
}
