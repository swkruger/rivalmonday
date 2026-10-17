'use client';

import { useRouter } from 'next/navigation';

export type RankTab = 'trend' | 'compare';
/** The page's current query (string values only), as built on the server. */
export type RankQuery = Record<string, string>;

/** `?…` for the current query with `patch` applied; an empty value drops the key. */
export function hrefWith(query: RankQuery, patch: RankQuery): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...patch })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `?${s}` : '?';
}

const TABS: { key: RankTab; label: string }[] = [{ key: 'trend', label: 'Trend' }, { key: 'compare', label: 'Compare' }];

/** Phase 13b D8: Trend (default) | Compare. Switching replaces the URL's `tab` and keeps the scroll position. */
export function RankTabs({ tab, query }: { tab: RankTab; query: RankQuery }) {
  const router = useRouter();
  return (
    <div role="tablist" aria-label="Rank views" className="flex gap-1 border-b border-line">
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`rank-tab-${t.key}`}
            aria-selected={on}
            aria-controls="rank-tabpanel"
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!on) router.replace(hrefWith(query, { tab: t.key === 'trend' ? '' : t.key }), { scroll: false }); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${on ? 'border-primary text-ink' : 'border-transparent text-muted-foreground hover:text-ink'}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
