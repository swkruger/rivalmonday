// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildWaitlistBody, ERRORS, sourceFrom, validateAgency, validateBusiness,
  type AgencyForm, type BusinessForm,
} from './waitlist-body';

const agency = (over: Partial<AgencyForm> = {}): AgencyForm => ({
  contactName: ' Jane Doe ', email: 'Jane@Agency.test', orgName: 'Doe Digital', website: '', clientCountBand: '6-15',
  wantsSample: false, sampleBusinessName: '', sampleWebsite: '', sampleLocation: '', ...over,
});
const business = (over: Partial<BusinessForm> = {}): BusinessForm => ({
  contactName: 'Sam Roe', email: 'sam@roeheating.test', orgName: 'Roe Heating', website: '', location: 'Austin, TX', vertical: 'hvac_plumbing', verticalOther: '', ...over,
});

describe('buildWaitlistBody', () => {
  it('agency body has kind, band and no sample when unticked', () => {
    const body = buildWaitlistBody({ kind: 'agency', form: agency({ sampleBusinessName: 'Ignored', sampleLocation: 'Austin' }) }, 'tok', null);
    expect(body).toMatchObject({ kind: 'agency', clientCountBand: '6-15', contactName: 'Jane Doe', email: 'Jane@Agency.test', turnstileToken: 'tok' });
    expect(body).not.toHaveProperty('sample');
  });

  it('sample needs website or location', () => {
    expect(validateAgency(agency({ wantsSample: true, sampleBusinessName: 'Roe Heating' })).sampleWebsite).toBe(ERRORS.websiteOrLocation);
    expect(validateAgency(agency({ wantsSample: true, sampleBusinessName: 'Roe Heating', sampleLocation: '78701' }))).toEqual({});
    const body = buildWaitlistBody({ kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: ' Roe Heating ', sampleLocation: '78701' }) }, 't', null);
    expect(body.sample).toEqual({ businessName: 'Roe Heating', location: '78701' });
  });

  it('business sends verticalId or verticalOther, never both', () => {
    const known = buildWaitlistBody({ kind: 'business', form: business({ verticalOther: 'stale text' }) }, 't', null);
    expect(known.verticalId).toBe('hvac_plumbing');
    expect(known).not.toHaveProperty('verticalOther');
    const other = buildWaitlistBody({ kind: 'business', form: business({ vertical: 'other', verticalOther: ' Roofing ' }) }, 't', null);
    expect(other.verticalOther).toBe('Roofing');
    expect(other).not.toHaveProperty('verticalId');
  });

  it('empty optionals are omitted', () => {
    const body = buildWaitlistBody({ kind: 'business', form: business({ website: '  ' }) }, 't', null);
    expect(body).not.toHaveProperty('website');
    expect(body).not.toHaveProperty('source');
    expect(Object.values(body)).not.toContain('');
  });
});

describe('sourceFrom', () => {
  it('prefers utm_source, then referrer host, then path, ≤ 200', () => {
    expect(sourceFrom({ search: '?utm_source=newsletter', pathname: '/x' }, 'https://google.com/search')).toBe('newsletter');
    expect(sourceFrom({ search: '', pathname: '/x' }, 'https://www.google.com/search?q=a')).toBe('www.google.com');
    expect(sourceFrom({ search: '', pathname: '/pricing' }, '')).toBe('/pricing');
    expect(sourceFrom({ search: '', pathname: '/pricing' }, 'not a url')).toBe('/pricing');
    expect(sourceFrom({ search: `?utm_source=${'a'.repeat(300)}`, pathname: '/' }, '')).toHaveLength(200);
  });

  it('ignores a same-host referrer (an internal page hop)', () => {
    expect(sourceFrom({ search: '', pathname: '/pricing', host: 'rivalmonday.com' }, 'https://rivalmonday.com/how-it-works')).toBe('/pricing');
    expect(sourceFrom({ search: '', pathname: '/pricing', host: 'rivalmonday.com' }, 'https://news.example/post')).toBe('news.example');
  });

  it('keeps the first-touch utm_source or external referrer for the session', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const host = 'rivalmonday.com';
    // Landing on a path first stores nothing.
    expect(sourceFrom({ search: '', pathname: '/', host }, '', storage)).toBe('/');
    expect(sourceFrom({ search: '?utm_source=newsletter', pathname: '/', host }, '', storage)).toBe('newsletter');
    // Later hops (same-host referrer, no utm, even another external referrer) keep the first touch.
    expect(sourceFrom({ search: '', pathname: '/pricing', host }, 'https://rivalmonday.com/', storage)).toBe('newsletter');
    expect(sourceFrom({ search: '?utm_source=other', pathname: '/x', host }, 'https://b.example/', storage)).toBe('newsletter');
  });

  it('works when sessionStorage throws', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(sourceFrom({ search: '?utm_source=ads', pathname: '/', host: 'h' }, '', storage)).toBe('ads');
    expect(sourceFrom({ search: '', pathname: '/x', host: 'h' }, '', storage)).toBe('/x');
  });
});

describe('validators', () => {
  it('link-ish contact or sample name gets the web-address message', () => {
    expect(validateAgency(agency({ contactName: 'acme.com' })).contactName).toBe('Please leave web addresses out of this field.');
    expect(validateBusiness(business({ contactName: 'https://x.co' })).contactName).toBe(ERRORS.linkish);
    expect(validateAgency(agency({ wantsSample: true, sampleBusinessName: 'www.roe', sampleLocation: 'Austin' })).sampleBusinessName).toBe(ERRORS.linkish);
    // org names may contain domain-like text (server plainName applies to contact + sample names only)
    expect(validateAgency(agency({ orgName: 'Doe.com Digital' }))).toEqual({});
  });

  it('over-long field gets the length message', () => {
    expect(validateAgency(agency({ contactName: 'a'.repeat(121) })).contactName).toBe('Keep this under 120 characters.');
    expect(validateAgency(agency({ website: 'a'.repeat(254) })).website).toBe('Keep this under 253 characters.');
    expect(validateBusiness(business({ vertical: 'other', verticalOther: 'a'.repeat(81) })).verticalOther).toBe('Keep this under 80 characters.');
  });

  it('email the server refuses is refused here', () => {
    for (const bad of ['', 'nope', 'a@b', 'a b@c.test', `${'a'.repeat(250)}@x.co`]) {
      expect(validateAgency(agency({ email: bad })).email, bad).toBe(ERRORS.email);
    }
    expect(validateAgency(agency({ email: ' ok@x.co ' }))).toEqual({});
  });

  it('required fields are reported by name', () => {
    const e = validateAgency(agency({ contactName: '', orgName: '', clientCountBand: '' }));
    expect(Object.keys(e).sort()).toEqual(['clientCountBand', 'contactName', 'orgName']);
    const b = validateBusiness(business({ website: '', location: '', vertical: '' }));
    expect(Object.keys(b).sort()).toEqual(['vertical', 'website']);
  });
});
