import { type Db, agencyConnect, platformSetting } from '@cs/db';
import { eq } from 'drizzle-orm';

export const CONNECT_FEE_KEY = 'connect_application_fee_percent';

/** The platform-wide default Connect fee percent (0 when unset or malformed). */
export async function globalConnectFeePercent(db: Db): Promise<number> {
  const [s] = await db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, CONNECT_FEE_KEY));
  return Number(s?.value) || 0;
}

/** Q3: the agency's own percent when set (even an explicit 0), else the platform default. Read at Checkout creation only. */
export async function effectiveConnectFeePercent(db: Db, agencyId: string): Promise<number> {
  const [c] = await db.select({ pct: agencyConnect.applicationFeePercent }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId));
  if (c && c.pct !== null) return Number(c.pct) || 0;
  return globalConnectFeePercent(db);
}
