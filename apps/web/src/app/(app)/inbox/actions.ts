'use server';
import { listInbox, markAllRead, markRead } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { inboxOwnerFor, internalLink } from '@/server/inbox';

export async function openNotification(formData: FormData) {
  const { viewer } = await requireContext();
  const owner = inboxOwnerFor(viewer);
  const id = String(formData.get('id') ?? '');
  const item = (await listInbox(dbs().service, owner, { limit: 200 })).find((n) => n.id === id);
  if (!item) redirect('/inbox');
  await markRead(dbs().service, owner, id);
  redirect(internalLink(item.link, webEnv().appUrl));
}

export async function markAllReadAction() {
  const { viewer } = await requireContext();
  await markAllRead(dbs().service, inboxOwnerFor(viewer));
  revalidatePath('/inbox');
}
