import { describe, expect, it } from 'vitest';
import { clientIdFromPath, contextOf, NAV_CTX_COOKIE, type NavContext, parseNavCookie } from './nav-context';

const C = '00000000-0000-4000-8000-0000000000a1';
const FALLBACKS: (NavContext | null)[] = [null, 'platform', 'agency', 'client'];

describe('contextOf', () => {
  it('maps /platform/** to platform whatever the fallback', () => {
    for (const f of FALLBACKS) {
      expect(contextOf('/platform', f)).toBe('platform');
      expect(contextOf('/platform/x', f)).toBe('platform');
      expect(contextOf('/platform/agencies/abc?tab=1', f)).toBe('platform');
    }
  });

  it('maps /agency/** to agency whatever the fallback', () => {
    for (const f of FALLBACKS) {
      expect(contextOf('/agency', f)).toBe('agency');
      expect(contextOf('/agency/settings/team', f)).toBe('agency');
    }
  });

  it('maps /c/<uuid>/** to client whatever the fallback', () => {
    for (const f of FALLBACKS) {
      expect(contextOf(`/c/${C}`, f)).toBe('client');
      expect(contextOf(`/c/${C}/reviews`, f)).toBe('client');
      expect(contextOf(`/c/${C}?x=1`, f)).toBe('client');
    }
  });

  it('gives the fallback for non-contextual paths', () => {
    for (const f of FALLBACKS) {
      expect(contextOf('/inbox', f)).toBe(f);
      expect(contextOf('/settings/notifications', f)).toBe(f);
      expect(contextOf('/kb/getting-started', f)).toBe(f);
      expect(contextOf('/', f)).toBe(f);
    }
  });

  it('does not treat look-alike prefixes or a malformed client id as contextual', () => {
    for (const f of FALLBACKS) {
      expect(contextOf('/platformx', f)).toBe(f);
      expect(contextOf('/agencyx/team', f)).toBe(f);
      expect(contextOf('/c/not-a-uuid/reviews', f)).toBe(f);
      expect(contextOf(`/c/${C}x/reviews`, f)).toBe(f);
      expect(contextOf(`/c/${C.slice(0, 35)}`, f)).toBe(f);
      expect(contextOf('/c/------------------------------------', f)).toBe(f);
      expect(contextOf('/c', f)).toBe(f);
    }
  });
});

describe('clientIdFromPath', () => {
  it('extracts the uuid only from a well-formed /c/<uuid> path', () => {
    expect(clientIdFromPath(`/c/${C}`)).toBe(C);
    expect(clientIdFromPath(`/c/${C}/settings/delivery`)).toBe(C);
    expect(clientIdFromPath(`/c/${C}?tab=briefs`)).toBe(C);
    expect(clientIdFromPath('/c/not-a-uuid')).toBeNull();
    expect(clientIdFromPath(`/c/${C}x`)).toBeNull();
    expect(clientIdFromPath('/agency')).toBeNull();
    expect(clientIdFromPath('')).toBeNull();
  });
});

describe('parseNavCookie', () => {
  it('has the agreed cookie name', () => {
    expect(NAV_CTX_COOKIE).toBe('rm_nav_ctx');
  });

  it('parses platform, agency and client:<uuid>', () => {
    expect(parseNavCookie('platform')).toEqual({ context: 'platform', clientId: null });
    expect(parseNavCookie('agency')).toEqual({ context: 'agency', clientId: null });
    expect(parseNavCookie(`client:${C}`)).toEqual({ context: 'client', clientId: C });
    expect(parseNavCookie(`client%3A${C}`)).toEqual({ context: 'client', clientId: C });
  });

  it('returns null for missing or garbage values', () => {
    for (const v of [undefined, '', 'client', 'client:', 'client:not-a-uuid', `client:${C}x`, `client:${C}:extra`, 'Platform', ' agency', 'agency ', 'other', '%E0%A4%A', `x:${C}`]) {
      expect(parseNavCookie(v)).toBeNull();
    }
  });
});
