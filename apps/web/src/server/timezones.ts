import { validTimezone } from '@cs/tools';

/**
 * Fix round 1 (review finding): built server-side only and passed down as a prop, so the server-rendered
 * `<select>` and the hydrated client markup list the exact same options — `Intl.supportedValuesOf('timeZone')`
 * can differ between the server's ICU and a browser's. It also always includes `'UTC'` (which the `client`
 * table's CHECK allows but Node 24's `supportedValuesOf` omits) and `current` itself (a legacy IANA alias such
 * as `'Asia/Kolkata'`, which resolves fine via `Intl.DateTimeFormat` but is missing from the canonical list,
 * which instead carries `'Asia/Calcutta'`). Without this, a `<select defaultValue={current}>` with no matching
 * `<option>` silently falls back to the browser's first option, so a save that never touched the time zone
 * field would still overwrite it.
 */
export function timezoneOptions(current: string): string[] {
  const base = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...base.filter(validTimezone), 'UTC', current])].sort();
}
