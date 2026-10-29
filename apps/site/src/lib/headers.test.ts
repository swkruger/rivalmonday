// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from './headers';

describe('security headers', () => {
  it('csp allows only the app origin for connect', () => {
    const csp = contentSecurityPolicy('https://rivalmonday.app/some/path', false);
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect).toContain("'self' https://rivalmonday.app ");
    expect(connect).not.toContain('/some/path');
    expect(connect).not.toContain('*.rivalmonday');
  });

  it('csp has frame-ancestors none and object-src none', () => {
    const csp = contentSecurityPolicy('https://rivalmonday.app', false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('no unsafe-eval in production', () => {
    expect(contentSecurityPolicy('https://rivalmonday.app', false)).not.toContain('unsafe-eval');
    expect(contentSecurityPolicy('https://rivalmonday.app', true)).toContain("'unsafe-eval'");
  });

  it('hsts and nosniff present', () => {
    const h = Object.fromEntries(securityHeaders('https://rivalmonday.app', false).map((x) => [x.key, x.value]));
    expect(h['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toBeTruthy();
  });
});
