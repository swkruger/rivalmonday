'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { hrefWith, type RankQuery } from './tabs';

/** Quiet time after the last step before the URL is replaced, so a drag or held arrow key navigates once. */
export const SCAN_COMMIT_MS = 300;

/**
 * Trend tab (Phase 13b D8): a "Scan" slider over the trend's scans (oldest → newest) that drives `?scan=` and so the
 * geo-grid below it. The in-progress position is local state. The URL is replaced (no history entry, no scroll jump)
 * once the value settles. The input is never remounted, so focus and a drag survive the navigation, and a new `value`
 * from the server (this navigation or any other) re-syncs the position.
 */
export function ScanSlider({ scans, value, query }: { scans: { id: string; label: string }[]; value: string | null; query: RankQuery }) {
  const router = useRouter();
  const indexOf = (v: string | null) => { const at = scans.findIndex((s) => s.id === v); return at >= 0 ? at : scans.length - 1; };
  const [i, setI] = useState(() => indexOf(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setI(indexOf(value)); } // derived re-sync on a new server value
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (scans.length < 2) return null;
  const pick = (n: number) => {
    setI(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const id = scans[n]!.id;
      if (id !== value) router.replace(hrefWith(query, { scan: id }), { scroll: false });
    }, SCAN_COMMIT_MS);
  };
  const shown = scans[Math.min(i, scans.length - 1)]!;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span id="scan-slider-label" className="font-semibold text-ink">Scan</span>
      <input
        type="range"
        aria-labelledby="scan-slider-label"
        min={0}
        max={scans.length - 1}
        step={1}
        value={i}
        aria-valuetext={shown.label}
        onChange={(e) => pick(Number(e.currentTarget.value))}
        className="w-64 accent-primary"
      />
      <output aria-live="polite" className="text-muted-ink">{shown.label}</output>
    </div>
  );
}
