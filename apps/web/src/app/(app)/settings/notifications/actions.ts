'use server';
import type { NotificationKind } from '@cs/db';
import { setMyNotificationPref, updateMyContact } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';

async function userId(): Promise<string> {
  const { viewer } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  return viewer.userId;
}

export async function setPrefAction(input: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean }) {
  const uid = await userId();
  await setMyNotificationPref(dbs().service, uid, { ...input, kind: input.kind as NotificationKind });
  revalidatePath('/settings/notifications');
}

/**
 * Controller ruling S8: `userId()` (which may call `notFound()`) runs BEFORE the `try` — Next's `notFound()` throws a
 * control-flow error that a catch here would otherwise turn into a form error string instead of the 404 page.
 */
export async function updateContactAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const uid = await userId();
  const start = String(formData.get('quietStart') ?? '');
  const end = String(formData.get('quietEnd') ?? '');
  try {
    await updateMyContact(dbs().service, uid, {
      contactId: String(formData.get('contactId') ?? ''),
      timezone: String(formData.get('timezone') ?? ''),
      quietHours: start && end ? { start, end } : null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save' };
  }
  revalidatePath('/settings/notifications');
  return { error: null };
}
