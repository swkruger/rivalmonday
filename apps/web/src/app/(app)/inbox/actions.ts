'use server';
import { listInbox, markAllRead, markRead } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { inboxOwnerFor, internalLink } from '@/server/inbox';
import { safeNext } from '@/server/safe-next';

export async function openNotification(formData: FormData) {
  const { viewer } = await requireContext();
  const owner = inboxOwnerFor(viewer);
  const id = String(formData.get('id') ?? '');
  const item = (await listInbox(dbs().service, owner, { limit: 200 })).find((n) => n.id === id);
  if (!item) redirect('/inbox');
  await markRead(dbs().service, owner, id);
  // Minor m1 (final review): every other input-derived redirect goes through `safeNext`; `internalLink` already
  // same-origin-checks the engine-supplied link, but re-validating here closes the one gap (e.g. `//evil.com`
  // surviving as a protocol-relative path) and keeps the rule exceptionless.
  redirect(safeNext(internalLink(item.link, webEnv().appUrl)));
}

export async function markAllReadAction() {
  const { viewer } = await requireContext();
  await markAllRead(dbs().service, inboxOwnerFor(viewer));
  revalidatePath('/inbox');
}
