import 'server-only';
import type { EnvName } from '@cs/db';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Phase 10: verifies a Cloudflare Turnstile token. DEMO/TEST, or no secret configured, use a fake verifier that
 * passes unless the token is `'fail'`. A network error or non-2xx response is a failed check. Never logs the token or IP.
 */
export async function verifyTurnstile(token: string, ip: string | null, env: { envName: EnvName; turnstileSecretKey?: string }): Promise<boolean> {
  if (env.envName !== 'dev' || !env.turnstileSecretKey) return token !== 'fail';
  try {
    const body = new URLSearchParams({ secret: env.turnstileSecretKey, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
