'use client';
import { Button, Input, Label } from '@cs/ui';
import Script from 'next/script';
import { useActionState, useEffect } from 'react';
import { type SignupState, startSignup } from './actions';
import { ErrorNote } from '@/components/form-error';

const REASONS: Record<string, string> = {
  link: 'That link expired or was already used. Fill in the form to get a new one.',
  google: 'Google sign-up did not work. Try again or use your email.',
};

/**
 * Shared by `/sign-up` and `/join/<token>` (token in a hidden field; the email is read-only when the link is locked to
 * one). The Turnstile widget (implicit rendering adds the `cf-turnstile-response` field) loads only here, and only when
 * the server passes a site key (never in DEMO/TEST).
 */
export function SignUpForm({
  googleEnabled, siteKey, inviteToken = null, lockedEmail = null, reason = null,
}: { googleEnabled: boolean; siteKey: string | null; inviteToken?: string | null; lockedEmail?: string | null; reason?: string | null }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(startSignup, { error: null, googleUrl: null });
  useEffect(() => {
    if (state.googleUrl) window.location.assign(state.googleUrl);
  }, [state.googleUrl]);
  const problem = state.error ?? (reason ? (REASONS[reason] ?? 'Sign-up failed. Try again.') : null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {problem && (
        <ErrorNote focusKey={state}>
          {problem}
        </ErrorNote>
      )}
      {inviteToken && <input type="hidden" name="inviteToken" value={inviteToken} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={lockedEmail ?? ''} readOnly={lockedEmail !== null} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="agencyName">Agency name</Label>
        <Input id="agencyName" name="agencyName" autoComplete="organization" required maxLength={120} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contactName">Your name (optional)</Label>
        <Input id="contactName" name="contactName" autoComplete="name" maxLength={120} />
      </div>
      {siteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={siteKey} />
        </>
      )}
      <Button type="submit" name="intent" value="email" disabled={pending}>
        Create my agency
      </Button>
      {googleEnabled && (
        <Button type="submit" name="intent" value="google" variant="outline" disabled={pending}>
          Continue with Google
        </Button>
      )}
    </form>
  );
}
