import { SettingsNav } from '@/components/settings-nav';
import { clientSettingsSections } from '@/server/client-settings-nav';

/**
 * Phase 15a §2.5: every client settings page (`/c/<id>/settings/*`) sits under one "Client settings" header and a
 * sub-nav (Business profile, Delivery, Alert rules, AI connection, Billing — each tab gated like its page). The pages
 * still check access themselves (404s unchanged), so this layout never refuses: a viewer with no tab (a guest, or a
 * client owner on Billing while billing is off) just gets the page without the settings chrome.
 */
export default async function ClientSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const sections = await clientSettingsSections(clientId);
  if (!sections.length) return <>{children}</>;
  return (
    <>
      {/* Task 8 swaps this for `PageHeader`. */}
      <h1 className="text-[26px] font-extrabold tracking-tight">Client settings</h1>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
        <SettingsNav sections={sections} />
        <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
      </div>
    </>
  );
}
