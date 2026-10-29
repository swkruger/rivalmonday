import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, openTestDbs, truncateAll } from '../test/helpers';
import { waitlistEntry } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const mk = (over: Partial<typeof waitlistEntry.$inferInsert> = {}): typeof waitlistEntry.$inferInsert => ({
  kind: 'agency', contactName: 'Pat', email: 'pat@example.com', orgName: 'Acme Agency', ipHash: 'h', ...over,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
});

describe('waitlist_entry', () => {
  it('app_user select returns permission denied', async () => {
    await dbs.service.insert(waitlistEntry).values(mk());
    expect(await errorText(dbs.app.select().from(waitlistEntry))).toMatch(/permission denied/);
  });

  it('unique (kind,email) rejects a duplicate', async () => {
    await dbs.service.insert(waitlistEntry).values(mk());
    expect(await errorText(dbs.service.insert(waitlistEntry).values(mk()))).toMatch(/waitlist_entry_kind_email_unique|duplicate key/);
  });

  it('the same email may exist once per kind', async () => {
    await dbs.service.insert(waitlistEntry).values([mk(), mk({ kind: 'business' })]);
    expect(await dbs.service.select().from(waitlistEntry)).toHaveLength(2);
  });

  it('email must be lower-case', async () => {
    expect(await errorText(dbs.service.insert(waitlistEntry).values(mk({ email: 'A@x.com' })))).toMatch(/waitlist_entry_email_check/);
  });

  it('sample_consistent: requested without sample_status fails', async () => {
    expect(await errorText(dbs.service.insert(waitlistEntry).values(mk({ sampleRequested: true })))).toMatch(/waitlist_entry_sample_consistent/);
  });

  it('business row cannot carry client_count_band', async () => {
    expect(await errorText(dbs.service.insert(waitlistEntry).values(mk({ kind: 'business', clientCountBand: '1-5' })))).toMatch(/waitlist_entry_agency_only/);
  });
});
