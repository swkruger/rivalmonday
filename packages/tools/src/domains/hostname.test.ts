import type { HostEnv } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { customHostnameProblem, normaliseHostname, sendingDomainProblem } from './hostname';

const env: HostEnv = { appUrl: 'https://rivalmonday.app', neutralDomain: 'clientdesk.example', extraPlatformHosts: [] };

describe('customHostnameProblem', () => {
  it('intel.agency.com ok', () => expect(customHostnameProblem('intel.agency.com', env)).toBeNull());
  it('agency.com → apex', () => expect(customHostnameProblem('agency.com', env)).toBe('apex'));
  it('foo.<neutral>, x.rivalmonday.app, x.staging.rivalmonday.app → reserved', () => {
    expect(customHostnameProblem('foo.clientdesk.example', env)).toBe('reserved');
    expect(customHostnameProblem('x.rivalmonday.app', env)).toBe('reserved');
    expect(customHostnameProblem('x.staging.rivalmonday.app', env)).toBe('reserved');
    expect(customHostnameProblem('a.b.rivalmonday.com', env)).toBe('reserved');
    // A staging APP_URL reserves its own host and its registrable root.
    const staging: HostEnv = { appUrl: 'https://staging.example.org', neutralDomain: 'staging.example.org', extraPlatformHosts: [] };
    expect(customHostnameProblem('x.example.org', staging)).toBe('reserved');
  });
  it('IDN normalised', () => {
    expect(normaliseHostname('Intel.Bücher.de')).toBe('intel.xn--bcher-kva.de');
    expect(customHostnameProblem('Intel.Bücher.de', env)).toBeNull();
  });
  it('trailing dot stripped', () => {
    expect(normaliseHostname('  Intel.Agency.com. ')).toBe('intel.agency.com');
    expect(customHostnameProblem('intel.agency.com.', env)).toBeNull();
  });
  it('bad label → invalid', () => {
    for (const bad of ['-x.agency.com', 'x-.agency.com', 'bad_label.agency.com', 'a..agency.com', 'localhost', 'intel.agency.123', '', `${'a'.repeat(64)}.agency.com`, 'https://intel.agency.com', 'intel.agency.com/x', 'x.rivalmonday.app/evil.com', 'intel.agency.com?x', 'intel.agency.com#x', 'intel%2eagency.com', 'intel.agency.com:8080', 'user@intel.agency.com', 'intel agency.com']) {
      expect(customHostnameProblem(bad, env), bad).toBe('invalid');
    }
  });
});

describe('sendingDomainProblem', () => {
  it('sending domain: apex ok, neutral and rivalmonday refused', () => {
    expect(sendingDomainProblem('agency.com', env)).toBeNull();
    expect(sendingDomainProblem('mail.agency.com', env)).toBeNull();
    expect(sendingDomainProblem('clientdesk.example', env)).toBe('reserved');
    expect(sendingDomainProblem('mail.clientdesk.example', env)).toBe('reserved');
    expect(sendingDomainProblem('rivalmonday.app', env)).toBe('reserved');
    expect(sendingDomainProblem('rivalmonday.com', env)).toBe('reserved');
    expect(sendingDomainProblem('not a domain', env)).toBe('invalid');
  });
});
