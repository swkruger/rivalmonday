import { formatDate } from '@/lib/format';

/** C1 (owner sign-off): a client at 100 % of its credits. Nothing is switched off. */
export const reachedCopy = (clientName: string) => `${clientName} has used this month's credits. Nothing changes — monitoring, briefs and Ask carry on as normal.`;

/** C2 (owner sign-off): agency admins, one line per paused client. */
export const pausedForAgency = (name: string, until: string) =>
  `AI work for ${name} is paused until ${formatDate(until, { tz: 'UTC' })} — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.`;

/** C3 (owner sign-off): client roles, their own client. An unbranded agency would read "Rival Monday": the copy then says "your team" (nothing client-facing names the platform). */
export const pausedForClient = (agencyName: string) => {
  const who = !agencyName.trim() || agencyName === 'Rival Monday' ? 'your' : `your ${agencyName}`;
  return `Monitoring and new briefs are paused for the rest of this month. Your past briefs and evidence are still here, and ${who} team has been told.`;
};
