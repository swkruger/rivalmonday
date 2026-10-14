import { createHash, randomBytes } from 'node:crypto';

export const INVITE_PREFIX = 'rm_inv_';

/** `rm_inv_` + 32 random bytes (base64url). Only the SHA-256 hex hash is stored; the prefix is a display hint. */
export function generateInviteToken(random: (n: number) => Uint8Array = (n) => randomBytes(n)): { token: string; hash: string; prefix: string } {
  const token = INVITE_PREFIX + Buffer.from(random(32)).toString('base64url');
  return { token, hash: hashInviteToken(token), prefix: token.slice(0, 12) };
}

export const hashInviteToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
