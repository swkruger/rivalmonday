'use client';

import { useMediaQuery } from '@cs/ui';
import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { formatDay } from '../../sample/format';
import type { SampleBriefData } from '../../sample/schema';
import { useInView } from '../motion/in-view';
import { EvidencePills, type OpenEvidence } from './brief-items';
import { CELL, labelOf, RankMap, weekStats, type Bucket } from './rank-map';

export { weekStats };

const LEGEND: { bucket: Bucket; label: string }[] = [
  { bucket: 'top3', label: '1–3' },
  { bucket: 'top10', label: '4–10' },
  { bucket: 'top20', label: '11–20' },
  { bucket: 'none', label: 'Not found' },
  { bucket: 'nodata', label: 'No data' },
];

/** One step of the "play" animation. */
const STEP_MS = 650;

/**
 * Map-rank grid over the sample town (P3): size × size scan points, rows north → south, each printing its rank,
 * coloured by bucket. It opens on the first of the 12 weekly scans and plays forward once on first view, so the
 * reader watches the business climb from its own street outwards; the slider and the weekly bars step through it.
 * Text alternative: the caption, the img label and a table.
 */
export function RankGrid({ data, onOpen, howHref }: { data: SampleBriefData; onOpen: OpenEvidence; /** Page explaining the scan. */ howHref?: string }) {
  const { keyword, size, weeks } = data.rankGrid;
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)') === true;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoplayed, setAutoplayed] = useState(false);
  const [ref, seen] = useInView<HTMLElement>(0.4);
  const sliderId = useId();
  const last = weeks.length - 1;

  // Autoplay once, the first time the grid is in view (never under reduced motion).
  useEffect(() => {
    if (!seen || reduced || autoplayed) return;
    setAutoplayed(true);
    setPlaying(true);
  }, [seen, reduced, autoplayed]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, index, last]);

  const week = weeks[index];
  if (!week) return null;
  const first = weekStats(weeks[0]!.you);
  const { top3, points } = weekStats(week.you);
  const caption = `Top 3 in ${top3} of ${points} points`;
  const weekLabel = `Week ${index + 1} of ${weeks.length} · ${formatDay(week.weekOf)}`;
  const rankEvidence = Object.values(data.evidence).filter((e) => e.kind === 'rank' && e.weekOf === week.weekOf && e.keyword === keyword);
  const evidenceId = rankEvidence.find((e) => e.kind === 'rank' && e.summary.startsWith('You:'))?.id;
  // Rival lines only where that week has the rival's own rank evidence ("no evidence, no claim"), leader first.
  const leader = week.leaderRivalId ? data.rivals.find((r) => r.id === week.leaderRivalId)?.name : undefined;
  const rivalLines = rankEvidence
    .flatMap((e) => (e.kind === 'rank' && !e.summary.startsWith('You:') ? [{ id: e.id, summary: e.summary }] : []))
    .sort((a, b) => Number(!!leader && b.summary.startsWith(`${leader}:`)) - Number(!!leader && a.summary.startsWith(`${leader}:`)));
  const rows = Array.from({ length: size }, (_, r) => week.you.slice(r * size, r * size + size));
  const trend = weeks.map((w) => weekStats(w.you));
  const max = Math.max(1, ...trend.map((t) => t.points));

  const select = (i: number) => {
    setAutoplayed(true);
    setPlaying(false);
    setIndex(i);
  };
  const toggle = () => {
    setAutoplayed(true);
    if (playing) return setPlaying(false);
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  return (
    <figure ref={ref} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-ink">Your map rankings for &ldquo;{keyword}&rdquo;</p>
        <p className="text-sm text-ink-secondary">
          {size} × {size} points across the service area. The ringed point is {data.business.name}.
        </p>
      </div>
      <div role="img" aria-label={`Map rankings for "${keyword}", week of ${formatDay(week.weekOf)}: ${caption.toLowerCase()}.`} className="mx-auto w-full max-w-md">
        <RankMap ranks={week.you} size={size} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={sliderId} className="font-medium text-ink">Week</label>
          <span aria-hidden="true" className="tabular-nums text-ink-secondary">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play all 12 weeks'}
            className="press flex size-11 shrink-0 items-center justify-center rounded-full border border-line-control bg-surface text-secondary hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          </button>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            aria-valuetext={`Week of ${formatDay(week.weekOf)}`}
            onChange={(e) => select(Number(e.currentTarget.value))}
            className="h-11 w-full accent-secondary"
          />
        </div>
        {/* Weekly top-3 counts (the caption's number for each scan); mouse shortcut only, the slider is the control. */}
        <div aria-hidden="true" className="flex h-10 items-end gap-1 pl-14">
          {trend.map((t, i) => (
            <button key={i} type="button" tabIndex={-1} title={`Week ${i + 1}: top 3 in ${t.top3} of ${t.points}`} onClick={() => select(i)} className="flex h-full flex-1 items-end">
              <span
                className={`w-full rounded-t-xs transition-colors duration-300 ${i === index ? 'bg-secondary' : i < index ? 'bg-secondary/40' : 'bg-muted-surface-2'}`}
                style={{ height: `${Math.max(6, (t.top3 / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => (
          <li key={l.bucket} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-full ${CELL[l.bucket]}`} />
            {l.label}
          </li>
        ))}
      </ul>
      <figcaption className="flex flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{caption}</span>
          {index > 0 && <span className="text-ink-secondary">up from {first.top3} in week 1</span>}
          {evidenceId && <EvidencePills ids={[evidenceId]} data={data} onOpen={onOpen} />}
        </span>
        {rivalLines.map((l, i) => (
          <span key={l.id} className="flex flex-wrap items-center gap-2 text-ink-secondary">
            {l.summary}
            <EvidencePills ids={[l.id]} data={data} onOpen={onOpen} start={(evidenceId ? 2 : 1) + i} />
          </span>
        ))}
      </figcaption>
      {howHref && (
        <a href={howHref} className="self-start text-sm font-medium text-link hover:underline">
          How the map scan works →
        </a>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer py-2 text-muted-ink">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{`Your rank at each point, week of ${formatDay(week.weekOf)}`}</caption>
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
                  {row.map((rank, c) => <td key={c}>{rank === null ? 'no data' : rank > 20 ? 'not found' : labelOf(rank)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
