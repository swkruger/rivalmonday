import Link from 'next/link';

/** Calm chip linking to the setup wizard while a client's setup is open (Phase 11a §7). Not forced: it only nudges. */
export function SetupBadge({ clientId, open, doneSteps }: { clientId: string; open: boolean; doneSteps: number }) {
  if (!open) return null;
  return (
    <Link
      href={`/c/${clientId}/setup`}
      className="inline-flex w-fit items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-primary-soft-text hover:underline"
    >
      Finish setup · {doneSteps} of 3
    </Link>
  );
}
