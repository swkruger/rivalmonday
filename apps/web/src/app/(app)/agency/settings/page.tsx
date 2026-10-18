import { notFound, redirect } from 'next/navigation';
import { settingsNavFor } from '@/components/shell/nav-items';
import { requireContext } from '@/server/current-viewer';
import { navFlagsFor } from '@/server/nav';

export const dynamic = 'force-dynamic';

/** Phase 15a §2.5: `/agency/settings` opens the viewer's first visible tab (the sidebar's "Agency settings" link). */
export default async function AgencySettingsIndex(): Promise<never> {
  const { viewer } = await requireContext();
  const first = settingsNavFor('agency', navFlagsFor(viewer))[0]?.items[0]?.href;
  if (!first) notFound();
  redirect(first);
}
