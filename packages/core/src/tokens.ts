import { createHash, randomBytes } from 'node:crypto';
import { type Role, isAgencyRole } from './access';

export const TOKEN_SCOPES = ['read', 'feedback', 'manage'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

const RANK: Record<TokenScope, number> = { read: 0, feedback: 1, manage: 2 };
export const scopeCovers = (have: TokenScope, need: TokenScope): boolean => RANK[have] >= RANK[need];

export function grantableScopes(role: Role): TokenScope[] {
  if (isAgencyRole(role)) return ['read', 'feedback', 'manage'];
  return role === 'client_owner' ? ['read', 'feedback'] : ['read']; // d4/d5: no manage for client roles in 6a
}

export function effectiveScope(granted: TokenScope, role: Role): TokenScope {
  const max = grantableScopes(role).at(-1)!;
  return RANK[granted] <= RANK[max] ? granted : max;
}

export const PAT_PREFIX = 'rm_pat_';
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BODY = 43; // ceil(256 / log2 62)

export function generatePat(random: (n: number) => Uint8Array = (n) => randomBytes(n)): { token: string; hash: string; prefix: string } {
  let n = BigInt(`0x${Buffer.from(random(32)).toString('hex')}`);
  let body = '';
  while (n > 0n) { body = ALPHABET[Number(n % 62n)] + body; n /= 62n; }
  const token = PAT_PREFIX + body.padStart(BODY, '0');
  return { token, hash: hashPat(token), prefix: token.slice(0, 12) };
}

export const hashPat = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
export const isPatFormat = (s: string): boolean => /^rm_pat_[0-9A-Za-z]{43}$/.test(s);
