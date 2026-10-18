'use client';
import { Button, Input, Label } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { ErrorNote } from '@/components/form-error';

const ERRORS: Record<string, string> = {
  link: 'That sign-in link expired or was already used. Ask for a new one below.',
  google: 'Google sign-in did not work for this account. Use the email you were invited with.',
};

/** Phase 11b Q3: `?email=` only fills the field (display only); anything that is not a plain email address is ignored. */
const EMAIL_HINT = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const validHint = (v: string | null | undefined): string => (v && v.length <= 320 && EMAIL_HINT.test(v) ? v : '');

/**
 * The same "check your email" result is shown for any address, invited or not (decision 2) — this component never
 * learns whether the send actually went out, so it cannot leak that information either.
 *
 * S10: `errorCallbackURL` carries `reason`, not `error` — Better Auth's own redirect sets its own `error` query
 * param on that URL (overwriting anything we put there), so the page below reads `reason` for this message.
 */
export function SignInForm({ next, googleEnabled, error, emailHint = null }: { next: string; googleEnabled: boolean; error: string | null; emailHint?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(() => validHint(emailHint));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(error ? ERRORS[error] ?? 'Sign-in failed. Try again.' : null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next, errorCallbackURL: '/sign-in?reason=link' });
    setBusy(false);
    if (res.error) {
      setProblem('We could not send a link just now. Wait a minute and try again.');
      return;
    }
    router.push('/sign-in/check-email');
  }

  return (
    <form onSubmit={sendLink} className="flex flex-col gap-4">
      {problem && (
        <ErrorNote>
          {problem}
        </ErrorNote>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>
        Email me a sign-in link
      </Button>
      {googleEnabled && (
        <Button
          type="button"
          variant="outline"
          onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL: '/sign-in?reason=google' })}
        >
          Continue with Google
        </Button>
      )}
    </form>
  );
}
