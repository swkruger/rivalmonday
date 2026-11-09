/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { type BriefReport, type ChartSeries, foldSeries } from '@cs/core';
import type { ReactNode } from 'react';
import { PrintLineChart } from '../charts/print-line-chart';
import { FONT, PRINT_CSS } from '../layout';
import { Body, Container, Head, Html } from '../rx';
import type { BriefReportDocumentProps } from '../types';
import { BriefBody } from './brief';
import { ReportCover } from './report-cover';
import { axisLabel, h3, hasPoints, keepSection, pageSection } from './report/format';
import { AlertsSection, MovesList, RankingsData, RecommendationsSection } from './report/lists';
import { SummarySection } from './report/summary';
import { TopicSection, topicHasChanges } from './report/topic';
import { TrendTable } from './trend-table';

/** Decided copy: the PDF's title (also its metadata title). */
export const briefReportTitle = (clientName: string, deliveryDate: string) => `${clientName} — weekly competitor report ${deliveryDate}`;

const CHART_W = 700;
const CHART_H = 220;

function Chart({ title, labels, series, yFormat }: { title: string; labels: string[]; series: ChartSeries[]; yFormat?: (v: number) => string }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ ...h3, marginTop: 0 }}>{title}</div>
      <PrintLineChart title={title} labels={labels.map(axisLabel)} series={series} width={CHART_W} height={CHART_H} yFormat={yFormat} />
    </div>
  );
}

/** The 12-month rating chart folds at render to you + 4 (the stored series are unfolded; rivals beyond that average into "Other"). */
const ratingSeries = (r: BriefReport): ChartSeries[] => {
  const self = r.rating.series.find((s) => s.you);
  return foldSeries(r.rating.series, 5, { aggregate: 'mean', pin: self ? [self.key] : [] });
};

function ReportShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <title>{title}</title>
        <style>{PRINT_CSS}</style>
      </Head>
      <Body style={{ backgroundColor: '#FFFFFF', color: '#0B2540', fontFamily: FONT, margin: 0 }}>
        <Container style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>{children}</Container>
      </Body>
    </Html>
  );
}

/**
 * The weekly report PDF (layout "C", spec §4.8): cover, summary, then one section per topic in spec order. A section
 * with neither data nor changes is omitted. No links, feedback line, contact block or assistant: it is a printout.
 * Old weekly briefs (no stored report) get the cover over today's body. Starting points never reach here (`renderBriefReportDocument`).
 */
export function BriefReportDocument(p: BriefReportDocumentProps) {
  const title = briefReportTitle(p.clientName, p.deliveryDate);
  const cover = <ReportCover branding={p.branding} clientName={p.clientName} deliveryDate={p.deliveryDate} periodLabel={p.periodLabel} />;
  const r = p.report;
  if (!r) {
    return (
      <ReportShell title={title}>
        {cover}
        {p.legacy ? (
          <div data-section="legacy" style={pageSection}>
            <BriefBody {...p.legacy} feedback={null} link={null} pdfLink={null} variant="document" />
          </div>
        ) : null}
      </ReportShell>
    );
  }
  const lines = p.changes?.lines ?? [];
  const rating = ratingSeries(r);
  const reviewsData = hasPoints(rating) || p.trend ? (
    <>
      {hasPoints(rating) ? <Chart title="Average rating by month" labels={r.rating.months} series={rating} yFormat={(v) => v.toFixed(1)} /> : null}
      {p.trend ? <TrendTable branding={p.branding} windowDays={p.trend.windowDays} businesses={p.trend.businesses} /> : null}
    </>
  ) : null;
  const adsData = hasPoints(r.ads.series) ? <Chart title="Active ads by week" labels={r.ads.weeks} series={r.ads.series} yFormat={(v) => String(Math.round(v))} /> : null;
  const rankingsData = r.rankings ? <RankingsData branding={p.branding} rankings={r.rankings} mapImage={p.mapImage} timezone={p.timezone} /> : null;
  const movesData = r.moves.length > 0 ? <MovesList moves={r.moves} timezone={p.timezone} /> : null;
  const show = (topic: Parameters<typeof topicHasChanges>[0], data: ReactNode | null) => data !== null || topicHasChanges(topic, p, lines);
  return (
    <ReportShell title={title}>
      {cover}
      <SummarySection doc={p} report={r} scorecard={p.scorecard} />
      {show('reviews', reviewsData) ? <TopicSection topic="reviews" doc={p} lines={lines} data={reviewsData} /> : null}
      {show('ads', adsData) ? <TopicSection topic="ads" doc={p} lines={lines} data={adsData} /> : null}
      {show('rankings', rankingsData) ? <TopicSection topic="rankings" doc={p} lines={lines} data={rankingsData} /> : null}
      {show('offers', null) ? <TopicSection topic="offers" doc={p} lines={lines} data={null} /> : null}
      {show('moves', movesData) ? <TopicSection topic="moves" doc={p} lines={lines} data={movesData} style={keepSection} noChangeNote={false} /> : null}
      {r.recommendations.length > 0 ? <RecommendationsSection recs={r.recommendations} /> : null}
      {r.alerts.length > 0 ? <AlertsSection alerts={r.alerts} timezone={p.timezone} /> : null}
    </ReportShell>
  );
}
