import type { AlertSummary, BriefSummary } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import Link from 'next/link';
import { formatWeekOf } from '@/lib/format';
import { BRIEF_STATUS, labelFor } from '@/lib/labels';

/**
 * Brief links (week, summary, status) — shared by the 5a home (`ClientHomeBasic`) and the Overview's "Past briefs".
 * The status chip is agency-only (15a §2.8): client roles only ever get delivered briefs, so it would say nothing.
 */
export function BriefLinkList({ clientId, items, empty, agency }: { clientId: string; items: BriefSummary[]; empty: string; agency: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-muted-foreground">{empty}</p>}
      {items.map((b) => (
        <Link key={b.id} href={`/c/${clientId}/briefs/${b.id}`} className="flex items-center gap-3 rounded-lg bg-muted-surface px-3 py-2 hover:bg-muted-surface-2">
          <span className="font-semibold">{b.kind === 'starting_point' ? 'Starting point' : formatWeekOf(b.deliveryDate, { tz: 'UTC' })}</span>
          <span className="truncate text-muted-foreground">{b.summary}</span>
          {agency && <BriefStatusChip status={b.status} />}
        </Link>
      ))}
    </div>
  );
}

function BriefStatusChip({ status }: { status: string }) {
  const s = labelFor(BRIEF_STATUS, status);
  return (
    <span className="ml-auto">
      <StatusChip tone={s.tone}>{s.label}</StatusChip>
    </span>
  );
}

/** Alert links (competitor — headline) — shared by the 5a home and the Overview's "Recent alerts". */
export function AlertLinkList({ clientId, items }: { clientId: string; items: AlertSummary[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-muted-foreground">No alerts.</p>}
      {items.map((a) => (
        <Link key={a.id} href={`/c/${clientId}/alerts/${a.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">
          <span className="font-semibold">{a.competitorName}</span> — {a.headline}
        </Link>
      ))}
    </div>
  );
}
