import type { AlertSummary, BriefSummary } from '@cs/tools';
import { Badge } from '@cs/ui';
import Link from 'next/link';

/** Brief links (week, summary, status) — shared by the 5a home (`ClientHomeBasic`) and the Overview's "Past briefs". */
export function BriefLinkList({ clientId, items, empty }: { clientId: string; items: BriefSummary[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-muted-foreground">{empty}</p>}
      {items.map((b) => (
        <Link key={b.id} href={`/c/${clientId}/briefs/${b.id}`} className="flex items-center gap-3 rounded-lg bg-muted-surface px-3 py-2 hover:bg-muted-surface-2">
          <span className="font-semibold">Week of {b.deliveryDate}</span>
          <span className="truncate text-muted-foreground">{b.summary}</span>
          <Badge variant="secondary" className="ml-auto">
            {b.status}
          </Badge>
        </Link>
      ))}
    </div>
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
