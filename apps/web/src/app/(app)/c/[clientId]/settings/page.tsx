import { notFound, redirect } from 'next/navigation';
import { clientSettingsSections } from '@/server/client-settings-nav';

export const dynamic = 'force-dynamic';

/** Phase 15a §2.5: `/c/<id>/settings` opens the viewer's first visible tab (the sidebar's "Client settings" link); none (guests) → 404. */
export default async function ClientSettingsIndex({ params }: { params: Promise<{ clientId: string }> }): Promise<never> {
  const { clientId } = await params;
  const first = (await clientSettingsSections(clientId))[0]?.items[0]?.href;
  if (!first) notFound();
  redirect(first);
}
