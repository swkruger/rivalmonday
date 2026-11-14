import 'server-only';
import { type HostEnv, mcpOrigin, platformOrigin } from '@cs/db';
import { headers } from 'next/headers';
import { webEnv } from './env';
import type { HostInfo } from './hosts';

/** 13a1 (P6): the host a request is served on and its validated origin. Better Auth runs one instance per `origin`. */
export interface RequestHost { origin: string; info: HostInfo }

/**
 * Pure part of {@link requestHost}. Only the proxy sets `x-rm-host-kind` / `x-rm-host-agency` / `x-rm-origin` (it strips
 * client copies first); absent = platform (unit tests, `/health`). An agency host without its agency id or origin, or an
 * unknown kind, throws (fail closed) — the proxy always sets them together.
 */
export function requestHostFrom(h: Headers, env: HostEnv): RequestHost {
  const kind = h.get('x-rm-host-kind');
  const origin = h.get('x-rm-origin');
  if (kind === null || kind === 'platform') return { origin: origin ?? platformOrigin(env), info: { kind: 'platform' } };
  if (kind === 'mcp') return { origin: origin ?? mcpOrigin(env), info: { kind: 'mcp' } };
  const agencyId = h.get('x-rm-host-agency');
  if (kind === 'agency' && agencyId && origin) {
    // Non-canonical GETs were redirected by the proxy; no handler reads canonical/canonicalOrigin for anything else.
    return { origin, info: { kind: 'agency', agencyId, canonical: true, canonicalOrigin: origin } };
  }
  throw new Error('request host headers are incomplete');
}

/** The current request's host, from the proxy's headers. */
export async function requestHost(): Promise<RequestHost> {
  return requestHostFrom(await headers(), webEnv().hostEnv);
}
