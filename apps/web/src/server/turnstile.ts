import 'server-only';
import type { EnvName } from '@cs/db';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;
let warnedMissingKeys = false;

/**
 * Phase 10: verifies a Cloudflare Turnstile token. DEMO/TEST, or no secret configured, use a fake verifier that
 * passes unless the token is `'fail'`. A network error, a non-2xx response or a 5 s timeout is a failed check. In DEV
 * without keys it warns once (the bot check is off). Never logs the token, the secret or the IP.
 */
export async function verifyTurnstile(token: string, ip: string | null, env: { envName: EnvName; turnstileSecretKey?: string }): Promise<boolean> {
  if (env.envName !== 'dev' || !env.turnstileSecretKey) {
    if (env.envName === 'dev' && !warnedMissingKeys) {
      warnedMissingKeys = true;
      console.warn('[signup] Turnstile keys missing — bot check disabled');
    }
    return token !== 'fail';
  }
  try {
    const body = new URLSearchParams({ secret: env.turnstileSecretKey, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    if (!res.ok) return false;
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
