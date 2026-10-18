'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';

export type ActivityKind = 'agency_created' | 'client_created' | 'client_activated' | 'first_brief_sent' | 'health_at_risk' | 'support_session_started';
export interface ActivityItem {
  at: string;
  kind: ActivityKind;
  agencyId: string;
  agencyName: string;
  clientName?: string;
}
export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

function describe(i: ActivityItem): string {
  switch (i.kind) {
    case 'agency_created':
      return 'signed up';
    case 'client_created':
      return `added ${i.clientName ?? 'a client'}`;
    case 'client_activated':
      return `activated ${i.clientName ?? 'a client'}`;
    case 'first_brief_sent':
      return 'sent its first brief';
    case 'health_at_risk':
      return 'is now at risk';
    case 'support_session_started':
      return 'had a support session opened';
  }
}

export function ActivityFeed({ initial, loadMore }: { initial: ActivityPage; loadMore: (cursor: string) => Promise<ActivityPage> }) {
  const [page, setPage] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (page.items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  const more = () => {
    const cursor = page.nextCursor;
    if (!cursor) return;
    start(async () => {
      try {
        const next = await loadMore(cursor);
        setError(null);
        setPage((p) => ({ items: [...p.items, ...next.items], nextCursor: next.nextCursor }));
      } catch {
        setError('Could not load more.');
      }
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-[#EEF2F6]">
        {page.items.map((i, n) => (
          <li key={`${i.at}-${i.kind}-${n}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm">
            <span>
              <Link href={`/platform/agencies/${i.agencyId}`} className="font-semibold text-secondary hover:underline">
                {i.agencyName}
              </Link>{' '}
              {describe(i)}
            </span>
            <time dateTime={i.at} className="text-xs text-muted-foreground">
              {i.at.slice(0, 10)}
            </time>
          </li>
        ))}
      </ul>
      {error && <ErrorNote compact>{error}</ErrorNote>}
      {page.nextCursor && (
        <button type="button" onClick={more} disabled={pending} className="self-start rounded-full bg-[#EEF2F6] px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-60">
          {pending ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}
