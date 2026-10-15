import Link from 'next/link';
import type { FormResult } from '@/server/forms';

/**
 * A form's error line. On a seat-cap refusal (`billing_seat_limit`) an agency admin also gets an Upgrade link to the
 * billing page; account managers see the message only (Phase 9a).
 */
export function FormError({ state, canUpgrade = false }: { state: FormResult; canUpgrade?: boolean }) {
  if (state.ok || !state.error) return null;
  return (
    <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
      {state.error}
      {canUpgrade && state.code === 'billing_seat_limit' && (
        <>
          {' '}
          <Link href="/agency/settings/billing" className="font-semibold underline">
            Upgrade
          </Link>
        </>
      )}
    </p>
  );
}
