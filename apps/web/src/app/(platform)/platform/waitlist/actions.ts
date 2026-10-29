'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { sendAgencyInviteEmail } from '@/server/invite-email';
import { runTool } from '@/server/run-tool';
import { endOfDayIso } from '../billing/parse';
import type { FoundPlace } from './place-lookup';

const PATH = '/platform/waitlist';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Result of a bulk invite. Held by an always-mounted component so it survives the list's `revalidatePath`. */
export type InviteResult = { ok: false; error: string } | { ok: true; message: string; failed: { orgName: string; url: string }[] } | null;

interface InviteRow { id: string; outcome: 'invited' | 'skipped'; email?: string; url?: string; expiresAt?: string }

/**
 * Invites the selected agencies: the tool creates one email-locked single-use link per row, then each link is emailed in turn.
 * A failed email never hides its link: it is returned for the operator to copy. Nothing logs the URL, token or address.
 */
export async function inviteAgenciesAction(_prev: InviteResult, fd: FormData): Promise<InviteResult> {
  const { ctx } = await requireOperatorContext();
  const ids = [...new Set(fd.getAll('ids').map((v) => String(v)).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: 'Select at least one agency' };
  const offer = str(fd, 'offer') === 'pilot' ? 'pilot' : 'trial';
  let pilotEndsAt: string | undefined;
  if (offer === 'pilot') {
    pilotEndsAt = endOfDayIso(str(fd, 'pilotEndsAt')) ?? undefined;
    if (!pilotEndsAt) return { ok: false, error: 'Choose when the pilot ends' };
  }
  const r = await runTool<{ results: InviteRow[] }>(ctx, 'invite_waitlist_agencies', { ids, offer, ...(pilotEndsAt ? { pilotEndsAt } : {}) });
  if (!r.ok) return r;
  revalidatePath(PATH);
  const failed: { orgName: string; url: string }[] = [];
  let invited = 0;
  for (const row of r.data.results) {
    if (row.outcome !== 'invited' || !row.email || !row.url || !row.expiresAt) continue;
    invited += 1;
    try {
      await sendAgencyInviteEmail({ to: row.email, url: row.url, offer, expiresAt: row.expiresAt, ...(pilotEndsAt ? { pilotEndsAt } : {}) });
    } catch (e) {
      // eslint-disable-next-line no-console -- failure class only
      console.error('[invite-email] send failed', (e as { name?: string } | null)?.name);
      failed.push({ orgName: str(fd, `org:${row.id}`) || row.email, url: row.url });
    }
  }
  return { ok: true, message: `Invited ${invited}. Skipped ${r.data.results.length - invited} (not confirmed or already handled).`, failed };
}

export async function declineWaitlistEntryAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'decline_waitlist_entry', { id: str(fd, 'id') });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Declined.' };
}

export type FindPlacesResult = { ok: true; places: FoundPlace[] } | { ok: false; error: string };

/** Google listing search for the assign (and sample) dialogs: a paid vendor call, capped per operator per day by the tool. */
export async function findPlacesAction(input: { name: string; location: string }): Promise<FindPlacesResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool<{ places: FoundPlace[] }>(ctx, 'platform_find_business', { name: String(input.name ?? ''), location: String(input.location ?? '') });
  return r.ok ? { ok: true, places: r.data.places } : r;
}

/** Gives a confirmed new business to an agency with its picked listing (`lookup` is the JSON `PlaceLookup` posts). */
export async function assignBusinessAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  let lookup: unknown;
  try {
    lookup = JSON.parse(str(fd, 'lookup'));
  } catch {
    return { ok: false, error: 'Pick the business listing first.' };
  }
  const r = await runTool(ctx, 'assign_waitlist_business', { id: str(fd, 'id'), agencyId: str(fd, 'agencyId'), lookup });
  if (!r.ok) return r;
  revalidatePath(PATH);
  return { ok: true, message: 'Assigned.' };
}
