'use client';

import { Band, Button, FridayAvatar, FridayBadge, Input, Kpi, KpiStrip, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow, TierMark } from '@cs/ui';
import { Bell } from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';
import { CLIENT_VIEW, type DashboardOpen, type DashboardView } from '../../../content/client-view';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { formatDay } from '../../sample/format';
import { SAMPLE } from '../../sample/schema';
import { useCountUp, useInView } from '../motion/in-view';
import { EvidencePanel } from '../sample/evidence-panel';
import { AdActivityChart } from './ad-activity-chart';
import { AdsView, BriefsView, CompetitorsView, MapView, Page, ReviewsPane } from './dashboard-views';
import { NoteMark } from './note-mark';

/** The app's pressure bars: red, then the warning step (amber stays Friday's on this site), then primary. */
const BAR = { high: 'bg-danger', elevated: 'bg-warning', low: 'bg-primary' } as const;
const PILL = { up: 'bg-chip-success-bg text-chip-success-text', down: 'bg-chip-danger-bg text-chip-danger-text', warn: 'bg-chip-warning-bg text-chip-warning-text', info: 'bg-chip-neutral-bg text-chip-neutral-text' } as const;
const pillClass = 'inline-flex min-h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums';

type Follow = (to: DashboardOpen, el: HTMLElement) => void;

/** `Kpi` renders its link through `linkAs`; here `href` is the KPI's label, and a click follows it like the app's link would. */
const KpiFollow = createContext<(label: string, el: HTMLElement) => void>(() => {});
function KpiButton({ href, className, ...rest }: { href: string } & React.ComponentProps<'button'>) {
  const follow = useContext(KpiFollow);
  return <button type="button" onClick={(e) => follow(href, e.currentTarget)} className={`${className ?? ''} w-full text-left hover:bg-canvas`} {...rest} />;
}

function CountUp({ value, decimals, suffix, active }: { value: number; decimals: number; suffix: string; active: boolean }) {
  const shown = useCountUp(value, active);
  return <>{shown.toFixed(decimals)}{suffix}</>;
}

function WhereYouStand() {
  const { heading, tiles, headers, self, table, movesHeading, moves } = CLIENT_VIEW.standing;
  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-base font-semibold text-ink">{heading} <NoteMark n={3} /></h4>
      <KpiStrip>
        {tiles.map((t) => (
          <Kpi
            key={t.label}
            label={t.label}
            value={t.value}
            caption={t.sub}
            badge={
              <span className={`${pillClass} ${PILL[t.up ? 'up' : 'down']}`}>
                <span aria-hidden="true">{t.up ? '▲' : '▼'} </span>
                <span className="sr-only">{t.up ? 'Up' : 'Down'} </span>
                {t.trend}
              </span>
            }
          />
        ))}
      </KpiStrip>
      <TableFrame className="overflow-x-auto">
        <Table density="compact">
          <caption className="sr-only">Scorecard: you against the rivals you watch</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {headers.map((h, i) => <TableHead key={h} scope="col" numeric={i !== 0}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-primary-soft font-semibold hover:bg-primary-soft">
              <TableCell>{self.name}</TableCell>
              {self.cells.map((c, i) => <TableCell key={i} numeric>{c}</TableCell>)}
            </TableRow>
            {table.map((row) => {
              const rival = SAMPLE.rivals.find((r) => r.id === row.rivalId)!;
              return (
                <TableRow key={row.rivalId}>
                  <TableCell>
                    <span className="flex items-center gap-2 whitespace-nowrap">{rival.name} <TierMark tier={rival.tier} /></span>
                  </TableCell>
                  {row.cells.map((c, i) => <TableCell key={i} numeric>{c}</TableCell>)}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
      <div>
        <h4 className="mt-2 text-base font-semibold text-ink">{movesHeading}</h4>
        <ul className="mt-1.5 list-disc pl-5 text-sm text-ink-secondary">
          {moves.map((m) => <li key={m}>{m}</li>)}
        </ul>
      </div>
    </section>
  );
}

function AskCard({ onAsk }: { onAsk: () => void }) {
  const { title, open, body, placeholder, button } = CLIENT_VIEW.overview.ask;
  return (
    <section aria-label={title} className="min-w-0">
      <Band tone="canvas">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FridayAvatar />
            <h4 className="text-base font-semibold text-ink">{title}</h4>
          </div>
          <button type="button" onClick={onAsk} className="text-sm font-semibold text-primary-soft-text hover:underline">{open}</button>
        </div>
        <p className="mt-1 text-sm text-muted-ink">{body}</p>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAsk();
          }}
        >
          <Input name="q" autoComplete="off" aria-label={placeholder} placeholder={placeholder} className="min-w-0 flex-1" />
          <Button type="submit">{button}</Button>
        </form>
        <ul aria-label="Starter questions" className="mt-3 flex flex-col">
          {FRIDAY_ANSWERS.slice(0, 4).map((a) => (
            <li key={a.id} className="border-t border-line py-2.5 text-13 text-ink-secondary">
              <button type="button" onClick={onAsk} className="flex w-full items-baseline gap-2 text-left hover:text-ink">
                <span aria-hidden="true">↳</span>
                {a.question}
              </button>
            </li>
          ))}
        </ul>
      </Band>
    </section>
  );
}

function Overview({ seen, onFollow, onView, onOpen, onAskFriday }: { seen: boolean; onFollow: Follow; onView: (v: DashboardView) => void; onOpen: (id: string, el: HTMLElement) => void; onAskFriday: () => void }) {
  const latest = SAMPLE.items.slice(0, 2);
  const weeks = SAMPLE.rankGrid.weeks.map((w) => w.weekOf);
  const followKpi = (label: string, el: HTMLElement) => {
    const kpi = CLIENT_VIEW.kpis.find((k) => k.label === label);
    if (kpi) onFollow(kpi.open, el);
  };
  return (
    <Page
      title="Overview"
      sub={CLIENT_VIEW.overview.description}
      actions={
        <span className="flex items-center gap-3">
          <StatusChip tone="info">Sample data</StatusChip>
          <button type="button" onClick={onAskFriday} className="press"><FridayBadge name={CLIENT_VIEW.overview.askAction} /></button>
        </span>
      }
    >
      <div className="relative">
        <span className="absolute -left-2.5 -top-2.5 z-10"><NoteMark n={1} /></span>
        <KpiFollow.Provider value={followKpi}>
          <KpiStrip>
            {CLIENT_VIEW.kpis.map((k) => (
              <Kpi
                key={k.label}
                linkAs={KpiButton}
                href={k.label}
                label={k.label}
                value={<CountUp value={k.value} decimals={k.decimals} suffix={k.suffix} active={seen} />}
                badge={<span className={`${pillClass} ${PILL[k.pill.tone]}`}>{k.pill.text}</span>}
                caption={k.caption}
                trace={k.trace}
                traceLabel={k.traceLabel}
              />
            ))}
          </KpiStrip>
        </KpiFollow.Provider>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-lg font-semibold text-ink">Week of {formatDay(SAMPLE.weekOf)}</h4>
              <button type="button" onClick={() => onView('briefs')} className="text-sm font-semibold text-primary-soft-text hover:underline">{CLIENT_VIEW.overview.archive}</button>
            </div>
            <Band tone="canvas">
              <p className="text-sm leading-relaxed text-ink">{CLIENT_VIEW.overview.summary}</p>
            </Band>
          </section>
          <WhereYouStand />
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-base font-semibold text-ink">Latest moves</h4>
              <button type="button" onClick={() => onView('briefs')} className="text-sm font-semibold text-primary-soft-text hover:underline">{CLIENT_VIEW.seeAll}</button>
            </div>
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {latest.map((item) => (
                <li key={item.id}>
                  <button type="button" aria-haspopup="dialog" onClick={(e) => onOpen(item.evidenceIds[0]!, e.currentTarget)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-canvas">
                    <span className="text-sm font-semibold text-ink">{item.headline}</span>
                    <span className="text-13 text-ink-secondary">{item.whyItMatters}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-base font-semibold text-ink">Competitor ad activity</h4>
              <button type="button" onClick={() => onView('ads')} className="text-sm font-semibold text-primary-soft-text hover:underline">{CLIENT_VIEW.seeAds}</button>
            </div>
            <div className="max-w-xl">
              <AdActivityChart weeks={weeks} series={CLIENT_VIEW.ads} />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <AskCard onAsk={onAskFriday} />
          <section className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 text-base font-semibold text-ink">Competitive pressure <NoteMark n={2} /></h4>
            <ul className="flex flex-col gap-2">
              {CLIENT_VIEW.pressure.map((p, i) => (
                <li key={p.name}>
                  <button type="button" onClick={(e) => onFollow(p.open, e.currentTarget)} className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-sm px-1.5 py-1 text-left hover:bg-canvas">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                      <b className="shrink-0 text-sm font-bold tabular-nums text-ink">{p.score}</b>
                    </span>
                    <span className="block truncate text-xs text-muted-ink">{p.reason}</span>
                    <span role="img" aria-label={`Competitive pressure ${p.score} of 100, ${p.level}`} className="mt-1 block h-2 overflow-hidden rounded-full bg-muted-surface-2">
                      <span className={`grow-bar block h-2 rounded-full ${BAR[p.level]}`} style={{ width: `${p.score}%`, transitionDelay: `${i * 90}ms` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <h4 className="text-base font-semibold text-ink">Recent alerts</h4>
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
        </div>
      </div>
    </Page>
  );
}

/**
 * The client's dashboard, recreated with sample data and the app's own `@cs/ui` parts (mirrors apps/web `c/[clientId]/page.tsx`).
 * It works like the real one: the menu switches pages, and numbers, rivals and alerts lead to the page or evidence sheet behind them.
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
    <div ref={ref} data-drawn={seen ? '' : undefined} className="flex min-h-0 flex-col bg-surface lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-b border-line bg-canvas p-2 lg:w-48 lg:border-b-0 lg:border-r lg:p-3">
        <span className="mb-3 hidden h-9 items-center justify-center rounded-md border border-dashed border-line-control text-xs font-medium text-muted-ink lg:flex">
          {CLIENT_VIEW.agency.logo}
        </span>
        <nav aria-label="Client menu (sample)" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
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
        <button type="button" onClick={onAskFriday} aria-label="Ask Friday" className="mt-3 hidden self-start lg:block">
          <FridayBadge />
        </button>
      </aside>

      {view === 'overview' && <Overview seen={seen} onFollow={follow} onView={onView} onOpen={open} onAskFriday={onAskFriday} />}
      {view === 'briefs' && <BriefsView onOpen={open} />}
      {view === 'competitors' && <CompetitorsView onOpen={open} onAds={() => onView('ads')} />}
      {view === 'map' && <MapView onOpen={open} />}
      {view === 'ads' && <AdsView onOpen={open} />}
      {view === 'reviews' && <ReviewsPane />}

      <EvidencePanel ev={openId ? SAMPLE.evidence[openId] ?? null : null} data={SAMPLE} onClose={() => setOpenId(null)} returnFocus={() => trigger.current} />
    </div>
  );
}
