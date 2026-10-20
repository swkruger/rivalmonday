import { SettingsNav } from '@/components/settings-nav';
import { clientSettingsSections } from '@/server/client-settings-nav';

/**
 * Phase 15a §2.5: every client settings page (`/c/<id>/settings/*`) sits beside one sub-nav (Business profile, Delivery,
 * Alert rules, AI connection, Runbook (agency roles), Billing — each tab gated like its page). Each page's own `PageHeader` (breadcrumb
 * "{client} › Client settings › {tab}") is the page's single h1, so this layout renders none. The pages still check
 * access themselves (404s unchanged), so this layout never refuses: a viewer with no tab (a guest, or a client owner on
 * Billing while billing is off) just gets the page without the sub-nav.
 */
export default async function ClientSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const sections = await clientSettingsSections(clientId);
  if (!sections.length) return <>{children}</>;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
      <SettingsNav sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
    </div>
  );
}
