'use client';
import { Button } from '@cs/ui';
import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { resendEmailAction, type ResendState } from './actions';

const COOLDOWN_S = 60;
const IDLE: ResendState = { status: 'idle', message: null };

/**
 * Spec §6: "Resend email" on both check-email variants. The address lives in the signed `rm_pending_email` cookie
 * (the form sends nothing). Every submit starts a 60 s cooldown; the result line reads the same whatever happened.
 * An expired or missing cookie turns the button into "Start again".
 */
export function ResendButton({ startAgainHref }: { startAgainHref: string }) {
  const [state, action, pending] = useActionState(resendEmailAction, IDLE);
  // Deadline-based, so a throttled background tab still shows the true remaining time.
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const left = until > now ? Math.ceil((until - now) / 1000) : 0;

  useEffect(() => {
    if (until === 0) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [until]);

  const start = () => {
    const n = Date.now();
    setNow(n);
    setUntil(n + COOLDOWN_S * 1000);
  };

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      {state.status === 'expired' ? (
        <Link href={startAgainHref} className="text-sm text-secondary underline">
          Start again
        </Link>
      ) : (
        <form action={action} onSubmit={start}>
          <Button type="submit" variant="outline" disabled={pending || left > 0}>
            {left > 0 ? `Resend in ${left} s` : 'Resend email'}
          </Button>
        </form>
      )}
      <p role="status" className="text-sm text-muted-ink">
        {state.message}
      </p>
    </div>
  );
}
