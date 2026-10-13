export type AgencyHealth = 'at_risk' | 'idle' | 'growing' | 'steady';

export interface HealthInput {
  today: Date;
  createdAt: Date;
  clientsActiveNow: number;
  clientsActive28dAgo: number | null;
  lastSignInAt: Date | null;
  lastBriefSentAt: Date | null;
}

const DAY = 86_400_000;

/** Spec d9: first match wins at_risk → idle → growing → steady. Pure; computed at read time. */
export function healthFlag(i: HealthInput): AgencyHealth {
  const ageDays = (i.today.getTime() - i.createdAt.getTime()) / DAY;
  const mature = ageDays >= 28;
  const quiet = (d: Date | null) => d === null || (i.today.getTime() - d.getTime()) / DAY >= 14;

  if (mature) {
    if (quiet(i.lastSignInAt)) return 'at_risk';
    if (i.clientsActive28dAgo !== null && i.clientsActiveNow < i.clientsActive28dAgo) return 'at_risk';
  }
  if (ageDays >= 14 && i.clientsActiveNow >= 1 && quiet(i.lastBriefSentAt)) return 'idle';
  if (mature && i.clientsActive28dAgo !== null && i.clientsActiveNow > i.clientsActive28dAgo) return 'growing';
  return 'steady';
}
