import { type Role, isAgencyRole } from './access';

export const TOKEN_SCOPES = ['read', 'feedback', 'manage'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

const RANK: Record<TokenScope, number> = { read: 0, feedback: 1, manage: 2 };
export const scopeCovers = (have: TokenScope, need: TokenScope): boolean => RANK[have] >= RANK[need];

export function grantableScopes(role: Role): TokenScope[] {
  if (isAgencyRole(role)) return ['read', 'feedback', 'manage'];
  // 7a2 D14: a client owner may grant manage (still bounded by role permission, client features and clientScope).
  return role === 'client_owner' ? ['read', 'feedback', 'manage'] : ['read'];
}

export function effectiveScope(granted: TokenScope, role: Role): TokenScope {
  const max = grantableScopes(role).at(-1)!;
  return RANK[granted] <= RANK[max] ? granted : max;
}

export const PAT_PREFIX = 'rm_pat_';
export const PAT_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const PAT_BODY_LENGTH = 43; // ceil(256 / log2 62)

export const isPatFormat = (s: string): boolean => /^rm_pat_[0-9A-Za-z]{43}$/.test(s);
