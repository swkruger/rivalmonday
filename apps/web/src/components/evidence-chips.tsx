import { CitationPill } from '@cs/ui';
import Link from 'next/link';
import type { EvidenceRefs } from '@/server/evidence-refs';

export const evidenceHref = (clientId: string, id: string) => `/c/${clientId}/evidence/${id}`;

/**
 * Decision 8: every chip opens the stored proof. With `refs` a chip names its source; without, it reads "Evidence n". `evidenceHref`
 * replaces the app's evidence page (17a: the public sample page links its own evidence route). No `'use client'` — safe in both server and client hosts.
 */
export function EvidenceChips({ clientId, ids, max = 6, refs, evidenceHref: hrefOf }: {
  clientId: string; ids: string[]; max?: number; refs?: EvidenceRefs; evidenceHref?: (id: string) => string;
}) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((id, i) => {
        const ref = refs?.[id];
        const link = <Link href={hrefOf ? hrefOf(id) : evidenceHref(clientId, id)} />;
        return ref ? (
          <CitationPill key={id} asChild n={i + 1} source={ref.source} date={ref.date}>
            {link}
          </CitationPill>
        ) : (
          <CitationPill key={id} asChild n={i + 1}>
            {link}
          </CitationPill>
        );
      })}
      {ids.length > max && <span className="text-xs text-muted-ink">+{ids.length - max} more</span>}
    </span>
  );
}
