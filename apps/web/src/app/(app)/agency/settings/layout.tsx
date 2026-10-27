import { notFound } from 'next/navigation';
import { SettingsNav } from '@/components/settings-nav';
import { settingsNavFor } from '@/components/shell/nav-items';
import { requireContext } from '@/server/current-viewer';
import { navFlagsFor } from '@/server/nav';

/**
 * Phase 15a §2.5: every agency settings page (`/agency/settings/*`) sits under one sub-nav (16b: the in-page chip row below `lg`; the sidebar drill-in from `lg` up); each page's own
 * `PageHeader` (breadcrumb "Agency settings › {tab}") is the page's single h1, so this layout renders none.
 * Tab visibility = each page's own gate (`settingsNavFor`); the pages still check access themselves (404s unchanged).
 * Only agency roles have agency settings, so anyone else 404s here.
 */
export default async function AgencySettingsLayout({ children }: { children: React.ReactNode }) {
  const { viewer } = await requireContext();
  const flags = navFlagsFor(viewer);
  if (!flags.isAgency) notFound();
  return (
    <div className="flex flex-col gap-5">
      <SettingsNav sections={settingsNavFor('agency', flags)} />
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}
