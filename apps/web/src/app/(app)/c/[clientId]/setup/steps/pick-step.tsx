'use client';
import type { Tier } from '@cs/tools';
import { Button } from '@cs/ui';
import { useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import { TIER_LABEL, TierChip } from '@/components/rival/tier-chip';
import type { ClientSafeSuggestion } from '../types';
import { formatMilesAway } from '@/lib/format';

const TIER_ORDER: Tier[] = ['top', 'watch', 'minor'];

/** Step 3. Top rivals arrive pre-ticked (`preTicked`, within the client's competitor limit); already-tracked ones are shown as tracking. */
export function PickStep({
  suggestions, pending, onDone, onSkip, reviewer, onReview,
}: {
  suggestions: ClientSafeSuggestion[]; pending: boolean; onDone: (accept: string[]) => void; onSkip: () => void;
  /** Staff only, once an owner is invited: the name on the "Ask {name} to review" button. */
  reviewer?: string | null; onReview?: () => void;
}) {
  const open = suggestions.filter((s) => s.status === 'suggested');
  const [selected, setSelected] = useState(() => new Set(open.filter((s) => s.preTicked).map((s) => s.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const groups = TIER_ORDER.map((t) => ({ tier: t, items: suggestions.filter((s) => s.tier === t && s.status !== 'dismissed') })).filter((g) => g.items.length > 0);

  return (
    <section className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      <h2 className="font-semibold">Pick competitors</h2>
      {groups.length === 0 && <p className="text-muted-foreground">No new businesses were found. You can add competitors by hand later.</p>}
      {groups.map((g) => (
        <fieldset key={g.tier} className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{TIER_LABEL[g.tier]}</legend>
          {g.items.map((s) => {
            const tracked = s.status === 'accepted';
            const rated = s.rating != null ? `${s.rating.toFixed(1)} stars${s.votes != null ? ` (${s.votes} reviews)` : ''}` : null;
            return (
              <label key={s.id} className="flex items-center gap-3 rounded-lg bg-muted-surface px-3 py-2">
                <input
                  type="checkbox" className="h-4 w-4" aria-label={s.name} disabled={tracked}
                  checked={tracked || selected.has(s.id)} onChange={() => toggle(s.id)}
                />
                <span className="font-semibold">{s.name}</span>
                <TierChip tier={s.tier} />
                {rated && <span className="text-sm text-muted-foreground">{rated}</span>}
                {s.distanceKm != null && <span className="text-sm text-muted-foreground">{formatMilesAway(s.distanceKm)} away</span>}
                {tracked && <span className="ml-auto text-sm font-semibold">Tracking</span>}
              </label>
            );
          })}
        </fieldset>
      ))}
      <WriteGuard>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => onDone([...selected])}>Done picking</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onSkip}>Skip for now</Button>
          {reviewer && onReview && <Button type="button" variant="ghost" disabled={pending} onClick={onReview}>Ask {reviewer} to review</Button>}
        </div>
      </WriteGuard>
    </section>
  );
}
