import { type Db, platformSetting } from '@cs/db';
import { eq } from 'drizzle-orm';

/** Phase 17a pilot switches, kept in `platform_setting` (same pattern as `signups_paused`). */
export const PILOT_MODE_KEY = 'pilot_mode'; // value { on: boolean }; missing row = off
export const SAMPLE_LIMIT_KEY = 'sample_brief_monthly_limit'; // value { n: number }; missing row = DEFAULT_SAMPLE_LIMIT
export const DEFAULT_SAMPLE_LIMIT = 10;
export const SAMPLE_AGENCY_KEY = 'sample_agency_id'; // value { agencyId }; written only by ensureSampleAgency (Task 10)

async function settingValue<T>(db: Db, key: string): Promise<T | undefined> {
  const [s] = await db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, key));
  return s?.value as T | undefined;
}

export async function sampleAgencyId(db: Db): Promise<string | null> {
  const v = await settingValue<{ agencyId?: unknown }>(db, SAMPLE_AGENCY_KEY);
  return typeof v?.agencyId === 'string' ? v.agencyId : null;
}

/** Missing row = off. */
export async function pilotMode(db: Db): Promise<boolean> {
  return (await settingValue<{ on?: boolean }>(db, PILOT_MODE_KEY))?.on === true;
}

export async function sampleBriefMonthlyLimit(db: Db): Promise<number> {
  const n = (await settingValue<{ n?: unknown }>(db, SAMPLE_LIMIT_KEY))?.n;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : DEFAULT_SAMPLE_LIMIT;
}
