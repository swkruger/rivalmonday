import { isUuid, verifyLink } from '@cs/core';
import type { EnvName } from '@cs/db';
import { DEMO_LINK_TARGET, isDemoEmail } from '@cs/demo/users';

export interface SignInDeps {
  env(): EnvName;
  secrets(): readonly string[];
  findContact(contactId: string): Promise<{ email: string; userId: string | null; active: boolean } | null>;
  /** Asks Better Auth for a sign-in link and returns its verify URL (captured in-process; nothing is emailed). */
  startMagicLink(email: string, req: Request): Promise<string | null>;
}

const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

/**
 * Deviation 4 and Review Focus 3: a demo user's signed link starts a real session, never in DEV and never for anyone
 * outside the demo domain. Better Auth's `onMagicLink` hook fires before its own sign-in-right check, so every rule
 * is enforced here before a link is asked for: a verified token of the demo link type, an active demo contact with a
 * user.
 */
export async function devSignIn(deps: SignInDeps, req: Request, token: string): Promise<Response> {
  const origin = new URL(req.url).origin;
  const expired = () => redirect(`${origin}/link-expired`);
  if (deps.env() === 'dev') return expired();
  const claims = verifyLink(deps.secrets(), token);
  // Final-review M6: only the link type the demo links are signed with; a real email link (a brief, an alert) is no
  // panel sign-in, even for a demo contact.
  if (!claims || claims.t !== DEMO_LINK_TARGET || !isUuid(claims.sub)) return expired();
  const c = await deps.findContact(claims.sub);
  if (!c || !c.active || !c.userId || !isDemoEmail(c.email)) return expired();
  const url = await deps.startMagicLink(c.email.trim().toLowerCase(), req);
  const verify = url ? sameOrigin(url, origin) : null;
  return verify ? redirect(verify) : expired();
}

/** Better Auth builds the verify URL on `APP_URL`; keep its path and query on the local origin the panel was opened on. */
function sameOrigin(url: string, origin: string): string | null {
  try {
    const u = new URL(url);
    return `${origin}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

type Hooks = { onMagicLink?: (email: string, url: string) => void };
const captured = new Map<string, string>();
let capturing = 0;
const capture = (email: string, url: string) => {
  captured.set(email.trim().toLowerCase(), url);
};

/**
 * Controller ruling 3: the sign-in-link capture exists only while a guarded panel sign-in runs `trigger`. The link for
 * `email` is read once and dropped right away, also when `trigger` throws; the hook is removed when no capture is left.
 */
export async function captureMagicLink(hooks: Hooks, email: string, trigger: () => Promise<unknown>): Promise<string | null> {
  const key = email.trim().toLowerCase();
  captured.delete(key);
  capturing++;
  hooks.onMagicLink = capture;
  try {
    await trigger();
    return captured.get(key) ?? null;
  } finally {
    captured.delete(key);
    if (--capturing === 0) {
      delete hooks.onMagicLink;
      captured.clear();
    }
  }
}
