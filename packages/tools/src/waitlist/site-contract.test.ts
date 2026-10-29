import { CLIENT_COUNT_BANDS } from '@cs/db';
import { describe, expect, it } from 'vitest';
// The site is a separate deployable that must not import @cs/tools; this test (the only place the two meet) proves it still agrees with the server.
import {
  buildWaitlistBody, CLIENT_BANDS, FIELD_MAX, LINKISH as SITE_LINKISH, validateAgency, validateBusiness,
  type AgencyForm, type BusinessForm,
} from '../../../../apps/site/src/lib/waitlist-body';
import { LINKISH, waitlistSubmitSchema } from './public';

const agency = (over: Partial<AgencyForm> = {}): AgencyForm => ({
  contactName: 'Jane Doe', email: 'jane@doedigital.test', orgName: 'Doe Digital', website: '', clientCountBand: '6-15',
  wantsSample: false, sampleBusinessName: '', sampleWebsite: '', sampleLocation: '', ...over,
});
const business = (over: Partial<BusinessForm> = {}): BusinessForm => ({
  contactName: 'Sam Roe', email: 'sam@roeheating.test', orgName: 'Roe Heating', website: '', location: 'Austin, TX', vertical: 'hvac_plumbing', verticalOther: '', ...over,
});

type Fixture = { name: string; input: { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm } };
const fixtures: Fixture[] = [
  { name: 'agency minimal', input: { kind: 'agency', form: agency() } },
  { name: 'agency with website', input: { kind: 'agency', form: agency({ website: 'https://doedigital.test', clientCountBand: '50+' }) } },
  { name: 'agency with sample by location', input: { kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: 'Roe Heating', sampleLocation: '78701' }) } },
  { name: 'agency with sample by website', input: { kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: "St. Louis Heating", sampleWebsite: 'https://roe.test', clientCountBand: '1-5' }) } },
  { name: 'business with known vertical', input: { kind: 'business', form: business({ website: 'https://roeheating.test' }) } },
  { name: 'business with other vertical', input: { kind: 'business', form: business({ vertical: 'other', verticalOther: 'Roofing', location: '' , website: 'https://roof.test' }) } },
];

/** a@<60-char labels>.co of exactly n characters (labels stay ≤ 63). */
function emailOfLength(n: number): string {
  let domain = '';
  while (n - 11 - domain.length > 64) domain += `${'b'.repeat(60)}.`;
  const rest = n - 11 - domain.length;
  return `${'a'.repeat(10)}@${domain}${'b'.repeat(rest - 3)}.co`;
}

const errorsOf = (i: Fixture['input']) => (i.kind === 'agency' ? validateAgency(i.form) : validateBusiness(i.form));

describe('site ↔ waitlistSubmitSchema contract', () => {
  it.each(fixtures)('built body is schema-valid: $name', ({ input }) => {
    const parsed = waitlistSubmitSchema.safeParse(buildWaitlistBody(input, 'turnstile-token', 'newsletter'));
    expect(parsed.success).toBe(true);
    expect(errorsOf(input)).toEqual({});
  });

  it('CLIENT_BANDS values equal @cs/db CLIENT_COUNT_BANDS', () => {
    expect(CLIENT_BANDS.map((b) => b.value)).toEqual([...CLIENT_COUNT_BANDS]);
  });

  it('LINKISH mirror matches', () => {
    expect(SITE_LINKISH.source).toBe(LINKISH.source);
    expect(SITE_LINKISH.flags).toBe(LINKISH.flags);
    for (const text of ['https://x.co', 'www.acme', 'acme.com', 'J.Smith', 'St. Louis Heating', 'A.C. Heating', 'Jane Doe']) {
      expect(SITE_LINKISH.test(text), text).toBe(LINKISH.test(text));
    }
  });

  it('validators agree with the schema', () => {
    const check = (input: Fixture['input'], label: string) => {
      const ok = waitlistSubmitSchema.safeParse(buildWaitlistBody(input, 't', null)).success;
      expect(Object.keys(errorsOf(input)).length === 0, label).toBe(ok);
    };
    for (const f of fixtures) check(f.input, f.name);

    const edge: [string, Fixture['input']][] = [];
    for (const n of [FIELD_MAX.contactName, FIELD_MAX.contactName + 1]) edge.push([`contactName ${n}`, { kind: 'agency', form: agency({ contactName: 'a'.repeat(n) }) }]);
    for (const n of [FIELD_MAX.orgName, FIELD_MAX.orgName + 1]) edge.push([`orgName ${n}`, { kind: 'business', form: business({ orgName: 'a'.repeat(n) }) }]);
    for (const n of [FIELD_MAX.website, FIELD_MAX.website + 1]) edge.push([`website ${n}`, { kind: 'agency', form: agency({ website: 'a'.repeat(n) }) }]);
    for (const n of [FIELD_MAX.location, FIELD_MAX.location + 1]) edge.push([`location ${n}`, { kind: 'business', form: business({ location: 'a'.repeat(n) }) }]);
    for (const n of [FIELD_MAX.verticalOther, FIELD_MAX.verticalOther + 1]) edge.push([`verticalOther ${n}`, { kind: 'business', form: business({ vertical: 'other', verticalOther: 'a'.repeat(n) }) }]);
    for (const n of [FIELD_MAX.sampleBusinessName, FIELD_MAX.sampleBusinessName + 1]) edge.push([`sample name ${n}`, { kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: 'a'.repeat(n), sampleLocation: 'Austin' }) }]);
    // email: total length 254 / 255 around the max
    for (const n of [254, 255]) edge.push([`email ${n}`, { kind: 'agency', form: agency({ email: emailOfLength(n) }) }]);
    expect(emailOfLength(254)).toHaveLength(254);
    expect(waitlistSubmitSchema.safeParse(buildWaitlistBody({ kind: 'agency', form: agency({ email: emailOfLength(254) }) }, 't', null)).success).toBe(true);
    for (const [label, input] of edge) check(input, label);

    const bad: [string, Fixture['input']][] = [
      ['empty name', { kind: 'agency', form: agency({ contactName: '' }) }],
      ['link-ish name', { kind: 'agency', form: agency({ contactName: 'acme.com' }) }],
      ['link-ish sample name', { kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: 'www.roe', sampleLocation: 'Austin' }) }],
      ['sample without website or location', { kind: 'agency', form: agency({ wantsSample: true, sampleBusinessName: 'Roe' }) }],
      ['business without website or location', { kind: 'business', form: business({ location: '' }) }],
      ['bad email', { kind: 'agency', form: agency({ email: 'nope' }) }],
      ['no band', { kind: 'agency', form: agency({ clientCountBand: '' }) }],
    ];
    for (const [label, input] of bad) {
      expect(waitlistSubmitSchema.safeParse(buildWaitlistBody(input, 't', null)).success, `${label} (schema)`).toBe(false);
      expect(Object.keys(errorsOf(input)).length, `${label} (site)`).toBeGreaterThan(0);
    }
  });
});
