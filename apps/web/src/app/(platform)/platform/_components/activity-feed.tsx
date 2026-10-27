'use client';
import { Button } from '@cs/ui';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import { HelpEmpty } from '@/components/help/empty-state';
import { formatDateTime } from '@/lib/format';

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

export function ActivityFeed({ initial, loadMore, tz }: { initial: ActivityPage; loadMore: (cursor: string) => Promise<ActivityPage>; tz: string }) {
  const [page, setPage] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (page.items.length === 0) return <HelpEmpty id="platform.overview.activity" guideAnchor="common-questions" />;
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
      <ul className="flex flex-col divide-y divide-line">
        {page.items.map((i, n) => (
          <li key={`${i.at}-${i.kind}-${n}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm">
            <span>
              <Link href={`/platform/agencies/${i.agencyId}`} className="font-semibold text-secondary hover:underline">
                {i.agencyName}
              </Link>{' '}
              {describe(i)}
            </span>
            <time dateTime={i.at} className="text-xs text-muted-ink">
              {formatDateTime(i.at, { tz, zoneLabel: true })}
            </time>
          </li>
        ))}
      </ul>
      {error && <ErrorNote compact>{error}</ErrorNote>}
      {page.nextCursor && (
        <Button type="button" variant="outline" onClick={more} disabled={pending} className="self-start">
          {pending ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </div>
  );
}
