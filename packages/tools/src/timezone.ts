import { safeTimezone } from '@cs/engine';

/** Same shape as `client`'s CHECK constraint (`packages/db/src/schema/tenancy.ts`): an IANA zone with 1-2 segments, or 'UTC'. */
const TZ_SHAPE = /^([A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}|UTC)$/;

/** True only for a zone `Intl` recognises (via `safeTimezone`'s try/catch) and that matches the DB's CHECK shape. */
export function validTimezone(tz: string): boolean {
  return safeTimezone(tz) === tz && TZ_SHAPE.test(tz);
}
