import { describe, expect, it } from 'vitest';
import { confirmsDomain, siteHost } from './host';

describe('siteHost', () => {
  it('lower-cases, strips www and ignores path', () => {
    expect(siteHost('https://WWW.AireServ.com/granbury/?cid=x')).toBe('aireserv.com');
  });
  it('accepts a bare domain and returns null on junk or empty', () => {
    expect(siteHost('glowdentalco.com')).toBe('glowdentalco.com');
    expect(siteHost('http://')).toBeNull();
    expect(siteHost('')).toBeNull();
    expect(siteHost(null)).toBeNull();
  });
});

describe('confirmsDomain', () => {
  it('matches the same host through www, path and query', () => {
    expect(confirmsDomain('https://www.aireserv.com/granbury/?cid=x', 'aireserv.com')).toBe(true);
  });
  it('rejects a different host', () => {
    expect(confirmsDomain('http://www.comfortmasters.net/', 'comfortmastersdfw.com')).toBe(false);
  });
  it('never confirms link hubs or the networks, even on a self-match', () => {
    for (const h of ['linktr.ee', 'linkin.bio', 'beacons.ai', 'app.trackable.io', 'facebook.com', 'instagram.com']) {
      expect(confirmsDomain(`https://${h}/x`, h)).toBe(false);
    }
  });
  it('is false when either side is missing', () => {
    expect(confirmsDomain(null, 'a.com')).toBe(false);
    expect(confirmsDomain('https://a.com', null)).toBe(false);
  });
});
