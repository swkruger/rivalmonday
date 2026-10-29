import { z } from 'zod';

/** Mirrors `@cs/tools` SiteStatus (17a). Never imported from there: the site only talks to the app over HTTP. */
const counter = z.number().int().nonnegative().nullable();

export const siteStatusSchema = z.object({
  pilotMode: z.boolean(),
  counters: z
    .object({
      rivalSitesWatched: counter,
      snapshotsThisWeek: counter,
      claimsChecked: counter,
      claimsDropped: counter,
    })
    .nullable(),
});
export type SiteStatus = z.infer<typeof siteStatusSchema>;

const TIMEOUT_MS = 5_000;

/** GET `<appUrl>/api/site-status`. Any failure (network, non-2xx, bad body, timeout) is `null`. */
export async function fetchSiteStatus(appUrl: string, signal?: AbortSignal): Promise<SiteStatus | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${appUrl}/api/site-status`, {
      method: 'GET',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return null;
    const parsed = siteStatusSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
