import { agencyConnect, platformSetting } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { effectiveConnectFeePercent } from './connect-fee';
import { resetBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const setGlobal = (value: unknown) =>
  dbs.owner.insert(platformSetting).values({ key: 'connect_application_fee_percent', value, updatedBy: 't' }).onConflictDoUpdate({ target: platformSetting.key, set: { value } });
const setAgency = (applicationFeePercent: string | null) =>
  dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, applicationFeePercent });

beforeEach(() => resetBilling(dbs.owner));

describe('effectiveConnectFeePercent (Q3)', () => {
  it('is 0 with no setting and no agency row', async () => {
    expect(await effectiveConnectFeePercent(dbs.service, IDS.agencyA)).toBe(0);
  });
  it('uses the global setting when the agency has no override', async () => {
    await setGlobal(2.5);
    await setAgency(null);
    expect(await effectiveConnectFeePercent(dbs.service, IDS.agencyA)).toBe(2.5);
  });
  it('uses the global setting when the agency has no connect row', async () => {
    await setGlobal(3);
    expect(await effectiveConnectFeePercent(dbs.service, IDS.agencyA)).toBe(3);
  });
  it('an agency override wins over the global', async () => {
    await setGlobal(2.5);
    await setAgency('1.25');
    expect(await effectiveConnectFeePercent(dbs.service, IDS.agencyA)).toBe(1.25);
  });
  it('an explicit 0 override wins over a non-zero global', async () => {
    await setGlobal(2.5);
    await setAgency('0.00');
    expect(await effectiveConnectFeePercent(dbs.service, IDS.agencyA)).toBe(0);
  });
});
