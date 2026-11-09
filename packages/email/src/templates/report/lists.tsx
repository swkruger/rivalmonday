/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { type BriefReport, formatDayRange, projectToImage, type RankMetric } from '@cs/core';
import type { Branding } from '../../branding';
import { num, numCell, td, th } from '../table-cells';
import { h2, keepSection, small } from './format';

type Rankings = NonNullable<BriefReport['rankings']>;
const rank = (m: RankMetric | null | undefined): string => (m && m.avgRank !== null && Number.isFinite(m.avgRank) ? m.avgRank.toFixed(1) : '—');
const day = (iso: string, tz: string) => formatDayRange(iso, iso, tz);

/**
 * Dot paint by rank band: the web geo grid's single-hue ramp (`rankFill` in apps/web charts/geo-grid.tsx is not a shared
 * helper, so the bands are repeated here). 1-3 darkest, 4-10, 11-20, then "not in the top 20" and "no data" as light dots.
 */
function dotPaint(rank: number | null): { fill: string; text: string; label: string } {
  if (rank === null) return { fill: '#ffffff', text: '#5B6B7F', label: '–' };
  if (rank <= 3) return { fill: '#0d366b', text: '#ffffff', label: String(rank) };
  if (rank <= 10) return { fill: '#256abf', text: '#ffffff', label: String(rank) };
  if (rank <= 20) return { fill: '#86b6ef', text: '#0B2540', label: String(rank) };
  return { fill: '#f0efec', text: '#0B2540', label: '20+' };
}

/** The map image (a `data:` URI: the print renderer blocks the network) with one rank dot per scan point, projected from the image bounds. */
function MapWithDots(p: { map: NonNullable<Rankings['map']>; image: { dataUri: string; attribution: string } }) {
  const { map: m } = p;
  const pts = m.points.map((pt) => { const xy = projectToImage(pt, m.bounds, m.width, m.height); return { x: Math.round(xy.x * 10) / 10, y: Math.round(xy.y * 10) / 10, ...dotPaint(pt.rank) }; });
  const radius = Math.max(10, Math.min(18, m.width / 40));
  return (
    <div style={{ marginBottom: 12 }}>
      <svg data-map-overlay viewBox={`0 0 ${m.width} ${m.height}`} width="100%" role="img" aria-label={`Map positions for ${m.keyword}`} style={{ display: 'block', borderRadius: 8 }}>
        <image href={p.image.dataUri} x={0} y={0} width={m.width} height={m.height} />
        {pts.map((q, i) => (
          <g key={i} data-rank-dot>
            <circle cx={q.x} cy={q.y} r={radius} fill={q.fill} fillOpacity={0.9} stroke="#ffffff" strokeWidth={1.5} />
            <text x={q.x} y={q.y} textAnchor="middle" dy="0.35em" fontSize={radius * 1.05} fontWeight={700} fill={q.text} fontFamily="Inter, Arial, sans-serif">{q.label}</text>
          </g>
        ))}
      </svg>
      <div style={small}>{`Your rank at each point for "${m.keyword}" (lower is better). ${p.image.attribution}`}</div>
    </div>
  );
}

/**
 * Map rankings data: the map image with rank dots (`mapImage` null = table only) and the keyword table —
 * average map position for you against <= 2 rivals and your previous scan.
 */
export function RankingsData(p: { branding: Branding; rankings: Rankings; mapImage: { dataUri: string; attribution: string } | null; timezone: string }) {
  const r = p.rankings;
  const rivalNames = [...new Set(r.keywords.flatMap((k) => k.rivals.map((x) => x.name)))].slice(0, 2);
  // No previous scan: no "Previous scan" column.
  const prev = r.prevScanAt !== null;
  const numCols = 1 + (prev ? 1 : 0) + rivalNames.length;
  return (
    <div>
      {p.mapImage && r.map ? <MapWithDots map={r.map} image={p.mapImage} /> : null}
      {r.keywords.length > 0 ? (
        <table width="100%" cellPadding={0} cellSpacing={0} border={0} aria-label="Average map position by keyword" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', backgroundColor: p.branding.panel, borderRadius: 8 }}>
          <colgroup>
            <col style={{ width: `${100 - 16 * numCols}%` }} />
            <col style={{ width: '16%' }} />
            {prev ? <col style={{ width: '16%' }} /> : null}
            {rivalNames.map((n) => <col key={n} style={{ width: '16%' }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Keyword</th>
              <th style={{ ...th, ...num }}>You</th>
              {prev ? <th style={{ ...th, ...num }}>Previous scan</th> : null}
              {rivalNames.map((n) => <th key={n} style={{ ...th, ...num }}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.keywords.map((k) => (
              <tr key={k.keyword}>
                <td style={td}>{k.keyword}</td>
                <td style={{ ...td, ...numCell, fontWeight: 700 }}>{rank(k.you)}</td>
                {prev ? <td style={{ ...td, ...numCell }}>{rank(k.prev)}</td> : null}
                {rivalNames.map((n) => <td key={n} style={{ ...td, ...numCell }}>{rank(k.rivals.find((x) => x.name === n)?.metric)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div style={{ ...small, paddingTop: 6 }}>{`Average map position (lower is better), scan of ${day(r.scanAt, p.timezone)}`}</div>
    </div>
  );
}

const STATUS = { emerging: 'Emerging', active: 'Active' } as Record<string, string>;

/** Open moves (<= 6) as a list; the caller appends move-based Major items. */
export function MovesList({ moves, timezone }: { moves: BriefReport['moves']; timezone: string }) {
  if (moves.length === 0) return null;
  return (
    <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 15, lineHeight: '22px' }}>
      {moves.map((m) => (
        <li key={m.id}>
          <strong>{m.label}</strong>
          {` · ${m.competitorName}`}
          <span style={small}>{` · ${STATUS[m.status] ?? m.status} since ${day(m.firstDetectedAt, timezone)}`}</span>
        </li>
      ))}
    </ul>
  );
}

export function RecommendationsSection({ recs }: { recs: BriefReport['recommendations'] }) {
  return (
    <div data-section="recommendations" style={keepSection}>
      <h2 style={h2}>Recommendations</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: '22px' }}>
        {recs.map((r) => (
          <li key={r.id}>
            {r.title}
            {r.status === 'in_progress' ? <span style={small}> · In progress</span> : null}
            {r.createdThisWeek ? <strong style={{ fontSize: 13, marginLeft: 6 }}>New this week</strong> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlertsSection({ alerts, timezone }: { alerts: BriefReport['alerts']; timezone: string }) {
  return (
    <div data-section="alerts" style={keepSection}>
      <h2 style={h2}>Recent alerts</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: '22px' }}>
        {alerts.map((a, i) => (
          <li key={i}>
            {a.headline}
            <span style={small}>{` · ${day(a.deliveredAt, timezone)}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
