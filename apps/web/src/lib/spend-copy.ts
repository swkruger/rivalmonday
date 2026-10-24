/** "November 1" (year added when not the current one, UTC) — the same long form as the Task 9 email. */
export function longDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const year = (x: Date) => x.getUTCFullYear();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(year(d) !== year(now) ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** C1 (owner sign-off): a client at 100 % of its credits. Nothing is switched off. */
export const reachedCopy = (clientName: string) => `${clientName} has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal.`;

/** C2 (owner sign-off): agency admins, one line per paused client. */
export const pausedForAgency = (name: string, until: string) =>
  `AI work for ${name} is paused until ${longDate(until)} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.`;

/** C3 (owner sign-off): client roles, their own client. An unbranded agency would read "Rival Monday": the copy then says "your team" (nothing client-facing names the platform). */
export const pausedForClient = (agencyName: string) => {
  const who = !agencyName.trim() || agencyName === 'Rival Monday' ? 'your' : `your ${agencyName}`;
  return `Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and ${who} team has been told.`;
};

/** D12(d) (owner sign-off): the Ask usage cell. A quota of 0 means a platform limit turned Ask off. */
export const askQuotaText = (q: { used: number; quota: number }): string =>
  q.quota === 0 ? `${q.used} used · Ask turned off by limit` : `${q.used} of ${q.quota}`;
