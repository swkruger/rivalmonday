import Link from 'next/link';

export const evidenceHref = (clientId: string, id: string) => `/c/${clientId}/evidence/${id}`;

/** Decision 8: every chip opens the stored proof. Replaces the old "N evidence items" spans. No `'use client'` — safe in both server and client hosts. */
export function EvidenceChips({ clientId, ids, max = 6 }: { clientId: string; ids: string[]; max?: number }) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((id, i) => (
        <Link key={id} href={evidenceHref(clientId, id)} className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text hover:underline">
          Evidence {i + 1}
        </Link>
      ))}
      {ids.length > max && <span className="text-xs text-muted-foreground">+{ids.length - max} more</span>}
    </span>
  );
}
