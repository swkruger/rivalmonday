import Link from 'next/link';
import { pausedForAgency, pausedForClient } from '@/lib/spend-copy';

const MAX_LINES = 3;

/**
 * 7b1 spend pause notice (calm, never red). `items` = the clients `get_spend_status` says are paused: the agency admin
 * sees up to three C2 lines plus "and {n} more"; a client role sees C3 once. Nothing here names dollars or the platform.
 */
export function SpendBanner({ items, audience, agencyName }: { items: { clientId: string; name: string; until: string }[]; audience: 'agency' | 'client'; agencyName: string }) {
  if (!items.length) return null;
  const shown = items.slice(0, MAX_LINES);
  const more = items.length - shown.length;
  return (
    <div role="region" aria-label="Usage" className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted-surface px-4 py-2 text-sm font-semibold text-ink lg:px-7">
      {audience === 'client' ? (
        <p>{pausedForClient(agencyName)}</p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            {shown.map((i) => (
              <p key={i.clientId}>{pausedForAgency(i.name, i.until)}</p>
            ))}
            {more > 0 && <p>{`and ${more} more`}</p>}
          </div>
          <Link href="/agency/settings/usage" className="rounded-sm bg-white px-3 py-1 text-xs font-semibold text-ink hover:opacity-90">
            View usage
          </Link>
        </>
      )}
    </div>
  );
}
