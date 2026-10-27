import { CitationPill } from '@cs/ui';
import type { EvidenceRefs } from '@/server/evidence-refs';

export const evidenceHref = (clientId: string, id: string) => `/c/${clientId}/evidence/${id}`;

/** Decision 8: every chip opens the stored proof. With `refs` a chip names its source; without, it reads "Evidence n". No `'use client'` — safe in both server and client hosts. */
export function EvidenceChips({ clientId, ids, max = 6, refs }: { clientId: string; ids: string[]; max?: number; refs?: EvidenceRefs }) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((id, i) => {
        const ref = refs?.[id];
        const href = evidenceHref(clientId, id);
        return ref ? <CitationPill key={id} href={href} n={i + 1} source={ref.source} date={ref.date} /> : <CitationPill key={id} href={href} n={i + 1} />;
      })}
      {ids.length > max && <span className="text-xs text-muted-ink">+{ids.length - max} more</span>}
    </span>
  );
}
