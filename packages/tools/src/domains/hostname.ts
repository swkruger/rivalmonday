import { domainToASCII } from 'node:url';
import { type HostEnv, RM_ROOTS, isUnder } from '@cs/db';

/** Phase 13a1 Appendix F: hostname rules for agency custom domains (web) and sending domains (email). Security-sensitive. */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
/**
 * Deviation from Appendix F (hardening, refuses more): Node's `domainToASCII` parses its input as a URL host, so it silently drops
 * a path/query/fragment (`a.b.com/x` → `a.b.com`) and percent-decodes (`a%2eb.com`). URL syntax and whitespace are refused first.
 */
const URL_SYNTAX = /[\s/?#\\%@:\u0000-\u001f\u007f]/;
export function normaliseHostname(input: string): string | null {
  if (URL_SYNTAX.test(input.trim())) return null;
  const h = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ''));
  if (!h || h.length > 253) return null;
  const labels = h.split('.');
  return labels.length >= 2 && labels.every((l) => LABEL.test(l)) && !/^\d+$/.test(labels.at(-1)!) ? h : null;
}
function reservedRoots(env: HostEnv): string[] {
  const appHost = new URL(env.appUrl).hostname;
  return [env.neutralDomain, ...RM_ROOTS, appHost, appHost.split('.').slice(-2).join('.')];
}
export function customHostnameProblem(input: string, env: HostEnv): 'invalid' | 'apex' | 'reserved' | null {
  const h = normaliseHostname(input);
  if (!h) return 'invalid';
  if (h.split('.').length < 3) return 'apex';
  return reservedRoots(env).some((r) => isUnder(h, r)) ? 'reserved' : null;
}
/** `extraReserved`: more roots refused with their subdomains (Task 10 review: the platform sender's `EMAIL_FROM` domain). */
export function sendingDomainProblem(input: string, env: HostEnv, extraReserved: readonly string[] = []): 'invalid' | 'reserved' | null {
  const h = normaliseHostname(input);
  if (!h) return 'invalid';
  const extra = extraReserved.map((r) => r.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  return [...reservedRoots(env), ...extra].some((r) => isUnder(h, r)) ? 'reserved' : null;
}
