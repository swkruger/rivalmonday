'use client';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { FormResult } from '@/server/forms';

/**
 * The one error primitive. Danger-tinted block with an icon; a new error takes focus and scrolls into view.
 * `compact` is the inline one-line variant; `quiet` is a live hint (role="status", never focuses or scrolls).
 * `passive` is for stored errors shown on load (a failed run in history): danger style kept, role="status" so a stale
 * error isn't re-announced as an alert, and it never takes focus or scrolls.
 * `focusKey` re-runs focus/scroll when it changes (FormError passes its action state, so a repeated identical
 * error refocuses).
 */
export function ErrorNote({ children, compact = false, quiet = false, passive = false, focusKey, className }: {
  children: React.ReactNode;
  compact?: boolean;
  quiet?: boolean;
  passive?: boolean;
  focusKey?: unknown;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (quiet || passive || !ref.current) return;
    const el = ref.current;
    el.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [focusKey, quiet, passive]);
  const base = compact
    ? 'flex items-start gap-1.5 text-sm text-ink'
    : 'flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-ink';
  return (
    <div ref={ref} role={quiet || passive ? 'status' : 'alert'} tabIndex={-1} className={`${base} outline-none${className ? ` ${className}` : ''}`}>
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
      <div>{children}</div>
    </div>
  );
}

/**
 * A form's error line. On a seat-cap refusal (`billing_seat_limit`) an agency admin also gets an Upgrade link to the
 * billing page; account managers see the message only (Phase 9a).
 */
export function FormError({ state, canUpgrade = false }: { state: FormResult; canUpgrade?: boolean }) {
  if (state.ok || !state.error) return null;
  return (
    <ErrorNote focusKey={state}>
      {state.error}
      {canUpgrade && state.code === 'billing_seat_limit' && (
        <>
          {' '}
          <Link href="/agency/settings/billing" className="font-semibold underline">
            Upgrade
          </Link>
        </>
      )}
    </ErrorNote>
  );
}
