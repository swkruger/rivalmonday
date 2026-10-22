import 'server-only';
import { validTimezone } from '@cs/tools';
import { cookies } from 'next/headers';

/** Phase 15c: the viewer's IANA zone from the client-written `rm_tz` cookie (`TzCookie`); missing or invalid -> 'UTC'. */
export async function viewerTimeZone(): Promise<string> {
  const raw = (await cookies()).get('rm_tz')?.value;
  if (!raw) return 'UTC';
  let zone: string;
  try {
    zone = decodeURIComponent(raw);
  } catch {
    return 'UTC';
  }
  return validTimezone(zone) ? zone : 'UTC';
}
