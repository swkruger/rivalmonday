import { agency, agencyConnect, clientBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectAgencyConnect } from './connect-apply';
import { resetBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const disconnect = (id: string = IDS.agencyA) => dbs.service.transaction((tx) => disconnectAgencyConnect(tx, id, 'user-1'));
const connectRow = async (id: string = IDS.agencyA) => (await dbs.owner.select().from(agencyConnect).where(eq(agencyConnect.agencyId, id)))[0]!;
const states = async () => Object.fromEntries((await dbs.owner.select().from(clientBilling)).map((r) => [r.clientId, r.state]));

beforeEach(async () => {
  await resetBilling(dbs.owner);
  await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, connectedAt: new Date() });
  await dbs.owner.insert(clientBilling).values([
    { clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'active' },
    { clientId: IDS.clientA2, agencyId: IDS.agencyA, state: 'off' },
  ]);
});

describe('disconnectAgencyConnect', () => {
  it('marks the connection disconnected, disables charges and moves non-off client billing to disconnected', async () => {
    expect(await disconnect()).toEqual({ changed: true });
    const c = await connectRow();
    expect(c).toMatchObject({ status: 'disconnected', chargesEnabled: false, stripeAccountId: 'acct_1' });
    expect(c.disconnectedAt).toBeInstanceOf(Date);
    expect(await states()).toEqual({ [IDS.clientA1]: 'disconnected', [IDS.clientA2]: 'off' });
  });

  it('is idempotent: a second call changes nothing', async () => {
    await disconnect();
    const first = await connectRow();
    expect(await disconnect()).toEqual({ changed: false });
    expect((await connectRow()).disconnectedAt).toEqual(first.disconnectedAt);
  });

  it('returns changed:false when the agency has no connection and leaves other agencies alone', async () => {
    expect(await disconnect(IDS.agencyB)).toEqual({ changed: false });
    expect((await connectRow()).status).toBe('connected');
    expect(await states()).toMatchObject({ [IDS.clientA1]: 'active' });
  });
});
