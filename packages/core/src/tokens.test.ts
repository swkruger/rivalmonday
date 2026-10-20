import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { effectiveScope, grantableScopes, isPatFormat, scopeCovers } from './tokens';
import { generatePat, hashPat } from './server/tokens';

describe('generatePat', () => {
  it('prefix, 50 chars, base62', () => {
    const { token } = generatePat();
    expect(token.startsWith('rm_pat_')).toBe(true);
    expect(token).toHaveLength(50);
    expect(isPatFormat(token)).toBe(true);
  });

  it('0x00… / 0xff… bytes encode to 43 chars', () => {
    const zero = generatePat(() => new Uint8Array(32));
    expect(zero.token).toBe(`rm_pat_${'0'.repeat(43)}`);
    const ff = generatePat(() => new Uint8Array(32).fill(0xff));
    expect(ff.token).toHaveLength(50);
    expect(isPatFormat(ff.token)).toBe(true);
  });

  it('hash = sha256 hex; prefix = 12 chars', () => {
    const p = generatePat();
    expect(p.hash).toBe(createHash('sha256').update(p.token).digest('hex'));
    expect(hashPat(p.token)).toBe(p.hash);
    expect(p.prefix).toBe(p.token.slice(0, 12));
    expect(p.prefix).toHaveLength(12);
  });
});

describe('isPatFormat', () => {
  it('rejects bad length/alphabet', () => {
    expect(isPatFormat(`rm_pat_${'a'.repeat(42)}`)).toBe(false);
    expect(isPatFormat(`rm_pat_${'a'.repeat(44)}`)).toBe(false);
    expect(isPatFormat(`rm_pat_${'a'.repeat(42)}-`)).toBe(false);
    expect(isPatFormat(`xx_pat_${'a'.repeat(43)}`)).toBe(false);
    expect(isPatFormat(`rm_pat_${'a'.repeat(43)}`)).toBe(true);
  });
});

describe('scopes', () => {
  it('scopeCovers is ordered', () => {
    expect(scopeCovers('manage', 'read')).toBe(true);
    expect(scopeCovers('read', 'feedback')).toBe(false);
  });
  it('grantableScopes per role', () => {
    expect(grantableScopes('agency_admin')).toEqual(['read', 'feedback', 'manage']);
    expect(grantableScopes('client_owner')).toEqual(['read', 'feedback']);
    expect(grantableScopes('client_viewer')).toEqual(['read']);
  });
  it('effectiveScope caps for client_owner/client_viewer', () => {
    expect(effectiveScope('manage', 'client_owner')).toBe('feedback');
    expect(effectiveScope('manage', 'client_viewer')).toBe('read');
    expect(effectiveScope('feedback', 'client_viewer')).toBe('read');
    expect(effectiveScope('read', 'client_owner')).toBe('read');
    expect(effectiveScope('manage', 'agency_admin')).toBe('manage');
  });
});
