import { formatDate } from '@/lib/format';

/** "Rated Oct 13" in the client's zone (decided copy, 15c-2b-2). */
export function ratedLabel(iso: string, tz: string): string {
  return `Rated ${formatDate(iso, { tz })}`;
}
