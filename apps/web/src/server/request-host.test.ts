import type { HostEnv } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { requestHostFrom } from './request-host';

const env: HostEnv = { appUrl: 'https://app.example', neutralDomain: 'neutral.example', extraPlatformHosts: [] };
const AGENCY = '11111111-1111-4111-8111-111111111111';
const from = (h: Record<string, string>) => requestHostFrom(new Headers(h), env);

describe('requestHostFrom (13a1 P6)', () => {
  it('no proxy headers = platform on APP_URL', () => {
    expect(from({})).toEqual({ origin: 'https://app.example', info: { kind: 'platform' } });
  });

  it('platform and mcp take the proxy origin, else the known one', () => {
    expect(from({ 'x-rm-host-kind': 'platform', 'x-rm-origin': 'https://app.example' })).toEqual({ origin: 'https://app.example', info: { kind: 'platform' } });
    expect(from({ 'x-rm-host-kind': 'mcp' })).toEqual({ origin: 'https://mcp.neutral.example', info: { kind: 'mcp' } });
  });

  it('agency host: agency id + origin, canonical', () => {
    expect(from({ 'x-rm-host-kind': 'agency', 'x-rm-host-agency': AGENCY, 'x-rm-origin': 'https://acme.neutral.example' })).toEqual({
      origin: 'https://acme.neutral.example',
      info: { kind: 'agency', agencyId: AGENCY, canonical: true, canonicalOrigin: 'https://acme.neutral.example' },
    });
  });

  it('fails closed on an agency host without agency or origin, and on an unknown kind', () => {
    expect(() => from({ 'x-rm-host-kind': 'agency', 'x-rm-origin': 'https://acme.neutral.example' })).toThrow();
    expect(() => from({ 'x-rm-host-kind': 'agency', 'x-rm-host-agency': AGENCY })).toThrow();
    expect(() => from({ 'x-rm-host-kind': 'other' })).toThrow();
  });
});
