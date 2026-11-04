/** Map-rank buckets: the app's single-hue ordinal ramp (site.css `--color-rank-*`), darker = better. */
export type Bucket = 'top3' | 'top10' | 'top20' | 'none' | 'nodata';

// Literal class strings so Tailwind sees them; the hex lives only in site.css (`--color-rank-*`).
export const CELL: Record<Bucket, string> = {
  top3: 'bg-rank-top3 text-rank-top3-ink',
  top10: 'bg-rank-top10 text-rank-top10-ink',
  top20: 'bg-rank-top20 text-rank-top20-ink',
  none: 'border border-line bg-rank-none text-rank-none-ink',
  // No rank recorded for the point (outside the caption's denominator): an empty, dashed cell.
  nodata: 'border border-dashed border-line-control bg-surface text-muted-ink',
};

/**
 * The same ordinal buckets in the rival tone (homepage §2, spec D13): the chart rival-1 role, one hue, darker = better.
 * Shades lay ink over rival-1, tints lay rival-1 over the surface (a gradient layer, so cells stay opaque over the map;
 * no hex). Numerals per bucket, checked with the dataviz validator (WCAG 2 / APCA Lc): top 3 white 6.5:1 / 86.9,
 * 4–10 white 4.7:1 / 77.3, 11–20 ink 7.6:1 / 60.7; ordinal ramp monotone, light end 2.0:1 on the surface.
 */
export const RIVAL_CELL: Record<Bucket, string> = {
  top3: 'bg-chart-rival-1 bg-linear-to-r from-ink/35 to-ink/35 text-surface',
  top10: 'bg-chart-rival-1 bg-linear-to-r from-ink/15 to-ink/15 text-surface',
  top20: 'bg-surface bg-linear-to-r from-chart-rival-1/55 to-chart-rival-1/55 text-ink',
  none: CELL.none,
  nodata: CELL.nodata,
};

/** Cell classes for a tone: `you` (default) is the client's own ramp, `rival` the rival-1 ramp. */
export type RankTone = 'you' | 'rival';
export const cellsFor = (tone: RankTone = 'you') => (tone === 'rival' ? RIVAL_CELL : CELL);

export const bucketOf = (rank: number | null): Bucket => (rank === null ? 'nodata' : rank > 20 ? 'none' : rank <= 3 ? 'top3' : rank <= 10 ? 'top10' : 'top20');
export const labelOf = (rank: number | null) => (rank === null ? '–' : rank > 20 ? '20+' : String(rank));

/** Top-3 count over the points that have a rank (the exporter's "N of P points"). */
export function weekStats(you: (number | null)[]) {
  return { top3: you.filter((r) => r !== null && r <= 3).length, points: you.filter((r) => r !== null).length };
}

/** The fictional sample town, generated once (no real place) and served from `public/sample`. */
export const SAMPLE_MAP_SRC = '/sample/marlowemere-map.webp';

/**
 * The scan points over the sample town's map: `size` × `size` cells, rows north → south, each printing its rank.
 * The centre point is the business itself (ringed). Decorative here: hosts give the text alternative.
 */
export function RankMap({ ranks, size, compact, tone }: { ranks: (number | null)[]; size: number; compact?: boolean; /** Colour ramp; default the client's own. */ tone?: RankTone }) {
  const centre = Math.floor((size * size) / 2);
  const cells = cellsFor(tone);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line bg-canvas">
      {/* Fixed square box: no layout shift while the image loads. */}
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      <div className={`absolute inset-0 grid ${compact ? 'gap-1 p-2' : 'gap-1.5 p-3 sm:gap-2 sm:p-4'}`} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {ranks.map((rank, i) => (
          <span
            key={i}
            data-rank-cell
            className={`rank-cell flex aspect-square items-center justify-center rounded-full font-semibold tabular-nums ${compact ? 'text-[0.625rem]' : 'text-xs sm:text-13'} ${cells[bucketOf(rank)]} ${i === centre ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
          >
            {labelOf(rank)}
          </span>
        ))}
      </div>
    </div>
  );
}
