'use client';

import { useMediaQuery } from '@cs/ui';
import { useEffect, useState } from 'react';
import { SAMPLE } from '../../sample/schema';
import { useInView } from '../motion/in-view';
import { RankMap, weekStats } from '../sample/rank-map';

/** Pause once in view before the first step (lets the card float in), then one step per scan. */
const START_MS = 700;
const STEP_MS = 380;

/**
 * The hero's map card: the sample's 12 weekly scans play once when the card is in view (on phones it sits below the
 * fold), from week 1 (only the business's own point in the
 * top 3) out to the latest, with the count updating beside it. The server renders the latest scan (no-JS and reduced
 * motion stay there); with scripts, `.hero-map` keeps the cells hidden until the first frame is chosen, so the end
 * state never flashes before the replay.
 */
export function HeroMapCard() {
  const weeks = SAMPLE.rankGrid.weeks;
  const last = weeks.length - 1;
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [index, setIndex] = useState(last);
  const [ready, setReady] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>(0.5);

  useEffect(() => {
    // `null` until the media query has been read; decide once it is known (no `matchMedia` at all: just show it).
    if (reduced === null) {
      if (typeof window.matchMedia !== 'function') setReady(true);
      return;
    }
    if (reduced) {
      setReady(true);
      return;
    }
    setIndex(0);
    setReady(true);
    if (!seen) return;
    let i = 0;
    let timer = setTimeout(function step() {
      i += 1;
      setIndex(i);
      if (i < last) timer = setTimeout(step, STEP_MS);
    }, START_MS);
    return () => clearTimeout(timer);
  }, [reduced, last, seen]);

  const week = weeks[index]!;
  const { top3, points } = weekStats(week.you);
  const from = weekStats(weeks[0]!.you).top3;
  return (
    <div ref={ref} data-ready={ready ? '' : undefined} className="hero-map">
      <RankMap ranks={week.you} size={SAMPLE.rankGrid.size} compact eager />
      <p className="mt-2.5 text-13 font-semibold tabular-nums text-ink">Top 3 in {top3} of {points} map points</p>
      <p className="text-xs text-ink-secondary">
        {index === last ? `Up from ${from} twelve weeks ago` : `Week ${index + 1} of ${weeks.length}`}
      </p>
    </div>
  );
}
