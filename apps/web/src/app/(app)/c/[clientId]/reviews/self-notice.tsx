import Link from 'next/link';

/** Shown instead of the KPI cards when the client has no self business row yet. */
export function SelfNotice({ clientId, selfPending, isAgency }: { clientId: string; selfPending: boolean; isAgency: boolean }) {
  if (selfPending) return <p className="rounded-lg bg-muted-surface p-3 text-ink">Your own reviews appear after the next Google profile check.</p>;
  return (
    <p className="rounded-lg bg-muted-surface p-3 text-ink">
      Add your Google place id on the Profile page to compare your own reviews.
      {isAgency && <> <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">Open Profile</Link></>}
    </p>
  );
}
