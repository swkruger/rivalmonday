/**
 * Spec §2.4 / D13: the context switcher's Recent and pinned clients live in this browser only, per membership
 * (`rm.switcher.recent.<membershipId>`, `rm.switcher.pins.<membershipId>`). Every access is in try/catch — private
 * windows, blocked site data and quota errors read as "nothing stored" — and only a JSON array of strings is trusted.
 * The caller filters the ids against the server's client list (stale ids are dropped there).
 */

const RECENT_MAX = 5;
const recentKey = (membershipId: string) => `rm.switcher.recent.${membershipId}`;
const pinsKey = (membershipId: string) => `rm.switcher.pins.${membershipId}`;

export function readIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeIds(key: string, ids: string[], max?: number): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(max === undefined ? ids : ids.slice(0, max)));
  } catch {
    // storage unavailable: the switcher still works, it just forgets
  }
}

/** Moves `clientId` to the front of the membership's recent list (at most 5). */
export function pushRecent(membershipId: string, clientId: string): void {
  const key = recentKey(membershipId);
  writeIds(key, [clientId, ...readIds(key).filter((id) => id !== clientId)], RECENT_MAX);
}

export function readRecent(membershipId: string): string[] {
  return readIds(recentKey(membershipId));
}

export function readPins(membershipId: string): string[] {
  return readIds(pinsKey(membershipId));
}

/** Pins or unpins `clientId`; returns the new list (also when storage is unavailable, so the UI still reflects the click). */
export function togglePin(membershipId: string, clientId: string): string[] {
  const key = pinsKey(membershipId);
  const current = readIds(key);
  const next = current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId];
  writeIds(key, next);
  return next;
}
