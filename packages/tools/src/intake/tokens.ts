import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hex of a raw token. Only this hash is stored; compare by hash lookup, never by raw string. */
export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/** 32 random bytes as base64url, plus its stored hash. The raw value is shown/sent once and never persisted. */
export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}
