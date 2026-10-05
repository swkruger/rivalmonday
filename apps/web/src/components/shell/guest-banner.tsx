import Link from 'next/link';

export function GuestBanner() {
  return (
    <div className="flex flex-shrink-0 items-center justify-center gap-1.5 bg-muted-surface px-4 py-2 text-center text-sm text-ink">
      <span>You are viewing this through an email link.</span>
      <Link href="/sign-in" className="font-semibold text-primary-soft-text underline">
        Sign in for the full workspace.
      </Link>
    </div>
  );
}
