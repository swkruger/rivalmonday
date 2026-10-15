import type { StartingPointStatus } from '@cs/tools';
import Link from 'next/link';

type Pending = Exclude<StartingPointStatus, { state: 'sent' }>;

const LABELS = [
  ['profile', 'Your Google profile'],
  ['reviews', 'Your reviews'],
  ['rankings', 'Map rankings'],
  ['competitors', 'Competitors'],
] as const;

/** Client home while the starting point is not sent yet. Once it is ready for review every check reads done; only agency users get the review link. */
export function StartingPointCard({ status, agency }: { status: Pending; agency: boolean }) {
  const checks = status.state === 'preparing' ? status.checks : { profile: true, reviews: true, rankings: true, competitors: true };
  return (
    <div>
      <h3 className="font-semibold text-ink">Preparing your starting point</h3>
      <ul className="mt-3 flex flex-col gap-1.5">
        {LABELS.map(([key, label]) => {
          const v = checks[key];
          return (
            <li key={key} className="flex items-center justify-between gap-3 rounded-lg bg-muted-surface px-3 py-2">
              <span>{label}</span>
              <span className="text-sm font-semibold">{v === true ? '✓' : v === false ? 'In progress' : 'Not needed'}</span>
            </li>
          );
        })}
      </ul>
      {agency && status.state === 'ready_for_review' && (
        <Link href="/agency/approvals" className="mt-3 inline-block font-semibold text-primary-soft-text">
          Review it
        </Link>
      )}
    </div>
  );
}
