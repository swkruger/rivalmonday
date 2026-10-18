import { notFound } from 'next/navigation';
import { SettingsNav } from '@/components/settings-nav';
import { settingsNavFor } from '@/components/shell/nav-items';
import { requireContext } from '@/server/current-viewer';
import { navFlagsFor } from '@/server/nav';

/**
 * Phase 15a §2.5: every agency settings page (`/agency/settings/*`) sits under one "Agency settings" header and a grouped
 * sub-nav. Tab visibility = each page's own gate (`settingsNavFor`); the pages still check access themselves (404s
 * unchanged). Only agency roles have agency settings, so anyone else 404s here.
 */
export default async function AgencySettingsLayout({ children }: { children: React.ReactNode }) {
  const { viewer } = await requireContext();
  const flags = navFlagsFor(viewer);
  if (!flags.isAgency) notFound();
  return (
    <>
      {/* Task 8 swaps this for `PageHeader`. */}
      <h1 className="text-[26px] font-extrabold tracking-tight">Agency settings</h1>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <SettingsNav sections={settingsNavFor('agency', flags)} />
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      </div>
    </>
  );
}
