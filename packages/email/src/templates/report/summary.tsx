/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { type BriefReport, GRADE_LABEL, GRADES, type GradedChangesView } from '@cs/core';
import { brandInk, type Branding } from '../../branding';
import type { BriefReportDocumentProps, ScorecardModel } from '../../types';
import { Scorecard } from '../scorecard';
import { h2, h3, muted, pageSection, small } from './format';

type Kpis = BriefReport['kpis'];
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/**
 * The four KPI tiles. Titles and pill wording are copied from the web Overview's `kpiCards`
 * (apps/web/src/app/(app)/c/[clientId]/overview-kpis.ts): @cs/email cannot import the web app. Keep them in step.
 */
export function kpiTiles(k: Kpis): { title: string; value: string; sub: string | null }[] {
  const adsDelta = k.activeAds === null || k.activeAds7dAgo === null ? null : k.activeAds - k.activeAds7dAgo;
  const ratingDelta = k.ratingSelf === null || k.ratingAvg === null ? null : Math.round((k.ratingSelf - k.ratingAvg) * 10) / 10;
  return [
    { title: 'Changes this week', value: String(k.changes7d), sub: k.alerts7d > 0 ? `${k.alerts7d} high` : null },
    { title: 'Competitor price moves', value: String(k.priceMoves7d), sub: k.priceCuts7d > 0 ? `↓ ${k.priceCuts7d} ${k.priceCuts7d === 1 ? 'cut' : 'cuts'}` : null },
    { title: 'Active competitor ads', value: k.activeAds === null ? '—' : String(k.activeAds), sub: adsDelta === null ? null : adsDelta === 0 ? 'Same as last week' : `${signed(adsDelta)} vs last week` },
    {
      title: 'Your rating vs area',
      value: k.ratingSelf === null ? '—' : `${k.ratingSelf} ★`,
      sub: ratingDelta === null ? null : ratingDelta > 0 ? `+${ratingDelta} above avg` : ratingDelta < 0 ? `−${Math.abs(ratingDelta)} below avg` : 'On par with the area',
    },
  ];
}

const LEVEL_LABEL = { low: 'Low', elevated: 'Elevated', high: 'High' } as const;

/** Grade totals as one line, e.g. "3 Major · 7 Notable · 22 Minor changes"; null when nothing changed. */
export const totalsLine = (c: GradedChangesView | null): string | null => {
  if (!c || GRADES.every((g) => c.totals[g] === 0)) return null;
  return `${GRADES.map((g) => `${c.totals[g]} ${GRADE_LABEL[g]}`).join(' · ')} changes`;
};

export function SummarySection(p: { doc: BriefReportDocumentProps; report: BriefReport; scorecard: ScorecardModel | null }) {
  const { doc, report } = p;
  const b: Branding = doc.branding;
  const firstMajorLine = doc.changes?.lines.find((l) => l.grade === 'major');
  const topMove = doc.items[0]?.headline ?? firstMajorLine?.text ?? 'No major moves this week';
  const actions = [...new Set(doc.items.map((i) => i.recommendedAction.trim()).filter((a) => a !== ''))];
  const nextSteps = (actions.length > 0 ? actions : report.recommendations.map((r) => r.title)).slice(0, 3);
  const totals = totalsLine(doc.changes);
  return (
    <div data-section="summary" style={pageSection}>
      <h2 style={h2}>This week</h2>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={6} border={0} style={{ width: '100%', borderCollapse: 'separate' }}>
        <tbody>
          <tr>
            {kpiTiles(report.kpis).map((t) => (
              <td key={t.title} style={{ width: '25%', verticalAlign: 'top', backgroundColor: b.panel, borderRadius: 8, padding: 10 }}>
                <div style={small}>{t.title}</div>
                <div style={{ fontSize: 22, lineHeight: '30px', fontWeight: 800 }}>{t.value}</div>
                {t.sub ? <div style={{ ...small, fontWeight: 600 }}>{t.sub}</div> : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 16, lineHeight: '24px', margin: '12px 0' }}>{doc.summary}</p>
      {totals ? <p style={{ ...small, margin: '0 0 12px' }}>{totals}</p> : null}
      <div className="card" style={{ backgroundColor: b.panel, borderRadius: 8, padding: 16, marginBottom: 12 }}>
        <div style={{ ...small, fontWeight: 600 }}>Top move</div>
        <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 700 }}>{topMove}</div>
      </div>
      {nextSteps.length > 0 ? (
        <div className="card">
          <h3 style={h3}>Next steps</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 16, lineHeight: '24px' }}>{nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      ) : null}
      {report.pressure.length > 0 ? (
        <div className="card">
          <h3 style={h3}>Competitive pressure</h3>
          {report.pressure.slice(0, 5).map((r) => (
            <div key={r.competitorId} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 14, lineHeight: '20px' }}>
                <strong>{r.name}</strong>
                <span style={{ color: muted }}>{` · ${LEVEL_LABEL[r.level]}`}</span>
              </div>
              {r.reason ? <div style={small}>{r.reason}</div> : null}
              <div style={{ height: 8, borderRadius: 4, backgroundColor: '#E3E9F0', marginTop: 4 }}>
                <div style={{ height: 8, borderRadius: 4, backgroundColor: brandInk(b.primary, b.secondary), width: `${Math.round(Math.min(100, Math.max(0, r.score)))}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {p.scorecard ? <Scorecard branding={b} model={p.scorecard} heading="Where you stand" /> : null}
    </div>
  );
}
