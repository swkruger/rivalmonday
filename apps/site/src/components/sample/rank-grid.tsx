'use client';

import { useId, useState } from 'react';
import { formatDay } from '../../sample/format';
import type { SampleBriefData } from '../../sample/schema';
import { EvidencePills, type OpenEvidence } from './brief-items';

type Bucket = 'top3' | 'top10' | 'top20' | 'none';

// Literal class strings so Tailwind sees them; the hex lives only in site.css (`--color-rank-*`).
const CELL: Record<Bucket, string> = {
  top3: 'bg-rank-top3 text-rank-top3-ink',
  top10: 'bg-rank-top10 text-rank-top10-ink',
  top20: 'bg-rank-top20 text-rank-top20-ink',
  none: 'border border-line bg-rank-none text-rank-none-ink',
};
const LEGEND: { bucket: Bucket; label: string }[] = [
  { bucket: 'top3', label: '1–3' },
  { bucket: 'top10', label: '4–10' },
  { bucket: 'top20', label: '11–20' },
  { bucket: 'none', label: 'Not found' },
];

const bucketOf = (rank: number | null): Bucket => (rank === null || rank > 20 ? 'none' : rank <= 3 ? 'top3' : rank <= 10 ? 'top10' : 'top20');
const labelOf = (rank: number | null) => (rank === null ? '–' : rank > 20 ? '20+' : String(rank));

/** Top-3 count over the points that have a rank (the exporter's "N of P points"). */
export function weekStats(you: (number | null)[]) {
  return { top3: you.filter((r) => r !== null && r <= 3).length, points: you.filter((r) => r !== null).length };
}

/**
 * Map-rank grid without a map background (P3): size × size cells, rows north → south, each printing its rank, coloured
 * by bucket; a week slider steps through the 12 scans. Text alternative: the caption, the img label and a table.
 */
export function RankGrid({ data, onOpen }: { data: SampleBriefData; onOpen: OpenEvidence }) {
  const { keyword, size, weeks } = data.rankGrid;
  const [index, setIndex] = useState(weeks.length - 1);
  const sliderId = useId();
  const week = weeks[index];
  if (!week) return null;
  const { top3, points } = weekStats(week.you);
  const caption = `Top 3 in ${top3} of ${points} points`;
  const weekLabel = `Week of ${formatDay(week.weekOf)}`;
  const leader = week.leaderRivalId ? data.rivals.find((r) => r.id === week.leaderRivalId)?.name : undefined;
  const evidenceId = Object.values(data.evidence).find((e) => e.kind === 'rank' && e.weekOf === week.weekOf && e.summary.startsWith('You:'))?.id;
  const rows = Array.from({ length: size }, (_, r) => week.you.slice(r * size, r * size + size));
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-ink">Your map rankings for &ldquo;{keyword}&rdquo;</p>
        <p className="text-sm text-ink-secondary">{size} × {size} points across the service area</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={sliderId} className="font-medium text-ink">Week</label>
          <span aria-hidden="true" className="text-ink-secondary">{weekLabel}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={weeks.length - 1}
          step={1}
          value={index}
          aria-valuetext={weekLabel}
          onChange={(e) => setIndex(Number(e.currentTarget.value))}
          className="w-full accent-secondary"
        />
      </div>
      <div
        role="img"
        aria-label={`Map rankings for "${keyword}", ${weekLabel.toLowerCase()}: ${caption.toLowerCase()}.`}
        className="mx-auto grid w-full max-w-sm gap-1"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {week.you.map((rank, i) => (
          <span key={i} data-rank-cell className={`flex aspect-square items-center justify-center rounded-xs text-xs font-semibold ${CELL[bucketOf(rank)]}`}>
            {labelOf(rank)}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => (
          <li key={l.bucket} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-xs ${CELL[l.bucket]}`} />
            {l.label}
          </li>
        ))}
      </ul>
      <figcaption className="flex flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{caption}</span>
          {evidenceId && <EvidencePills ids={[evidenceId]} data={data} onOpen={onOpen} />}
        </span>
        {leader && <span className="text-ink-secondary">Most first places among rivals: {leader}</span>}
      </figcaption>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-ink">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{`Your rank at each point, ${weekLabel.toLowerCase()}`}</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                {Array.from({ length: size }, (_, c) => <th key={c} scope="col">{c === 0 ? 'Col 1 (west)' : c === size - 1 ? `Col ${c + 1} (east)` : `Col ${c + 1}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="font-normal">{r === 0 ? 'Row 1 (north)' : r === size - 1 ? `Row ${r + 1} (south)` : `Row ${r + 1}`}</th>
                  {row.map((rank, c) => <td key={c}>{rank === null ? 'not found' : labelOf(rank)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
