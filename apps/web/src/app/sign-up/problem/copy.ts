import type { SignupProblem } from '@cs/tools';

export const GENERIC_PROBLEM = "We couldn't finish creating your agency. Contact support@rivalmonday.app.";

const COPY: Record<SignupProblem, string> = {
  email_lock_mismatch: 'This invite is for a different email address. Sign in with that address or ask Rival Monday for a new link.',
  link_used_up: 'This invite link has already been used.',
  link_revoked: 'This invite link is no longer valid.',
  link_expired: 'This invite link is no longer valid.',
};

/** Decided copy per problem; anything else (no row, no problem, unknown link) is the generic line. */
export const problemCopy = (p: SignupProblem | 'link_unknown' | null): string => (p && p !== 'link_unknown' ? COPY[p] : GENERIC_PROBLEM);
