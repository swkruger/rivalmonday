import { zoneLabel } from '@/lib/format';

/** "Monday 7:00 AM CT": when an approved brief goes out, in the client's own zone (briefs send Monday 07:00 client time). */
export function mondaySendTime(clientTimezone: string, now: Date = new Date()): string {
  return `Monday 7:00 AM ${zoneLabel(clientTimezone, now)}`;
}
