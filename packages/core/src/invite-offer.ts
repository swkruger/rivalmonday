const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Pilot invite links (phase-11-fixes D1): the pilot must still be running after the last day the link can be
 * redeemed. Compares UTC calendar days — `pilotEndsAt` is the end of a UTC day, so a pilot ending on the link's
 * expiry day is refused even though its instant is later. Returns the refusal copy, or null when the dates work.
 */
export function pilotLinkRefusal(pilotEndsAt: Date, linkExpiresAt: Date, now: Date): string | null {
  if (pilotEndsAt.getTime() <= now.getTime()) return 'The pilot end date has already passed. Choose a later date.';
  if (utcDay(pilotEndsAt) <= utcDay(linkExpiresAt)) {
    return `The pilot must end after this link expires on ${utcDay(linkExpiresAt)}. Choose a later pilot end date or a shorter expiry.`;
  }
  return null;
}
