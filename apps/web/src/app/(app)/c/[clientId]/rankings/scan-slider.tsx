'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { hrefWith, type RankQuery } from './tabs';

/**
 * Trend tab (Phase 13b D8): a "Scan" slider over the trend's scans (oldest → newest) that drives `?scan=` and so the
 * geo-grid below it. Each step replaces the URL (no history entry, no scroll jump). The page keys this component by
 * the selected scan, so a navigation from elsewhere resets the position.
 */
export function ScanSlider({ scans, value, query }: { scans: { id: string; label: string }[]; value: string | null; query: RankQuery }) {
  const router = useRouter();
  const at = scans.findIndex((s) => s.id === value);
  const [i, setI] = useState(at >= 0 ? at : scans.length - 1);
  if (scans.length < 2) return null;
  const go = (n: number) => {
    setI(n);
    const id = scans[n]!.id;
    if (id !== value) router.replace(hrefWith(query, { scan: id }), { scroll: false });
  };
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
        aria-valuetext={scans[i]!.label}
        onChange={(e) => go(Number(e.currentTarget.value))}
        className="w-64 accent-primary"
      />
      <output aria-live="polite" className="text-muted-foreground">{scans[i]!.label}</output>
    </div>
  );
}
