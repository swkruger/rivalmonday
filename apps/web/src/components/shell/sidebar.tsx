import type { Branding } from '@cs/email';
import { Wordmark } from '@cs/ui';
import type { NavRoleFlags } from './nav-items';
import { type NavClient, SidebarNav } from './sidebar-nav';

/**
 * 232px white column (docs/brand/mockups/01-client-overview.html `.side`). `branding.logoUrl` is only ever `https`
 * or `null` (Review Focus 5 — resolveBranding strips anything else before this prop exists).
 *
 * Stays a server component for the logo/wordmark/footer, which only depend on `branding`. The nav list itself is
 * `SidebarNav`, a 'use client' component: `Sidebar` lives in the App Router layout, which is NOT re-rendered across
 * client-side navigation, so anything here that must track the current URL (the active highlight, the
 * client-scoped items) has to read it live via `usePathname()` instead of a prop computed once on the server.
 */
export function Sidebar({ branding, flags, clients }: { branding: Branding; flags: NavRoleFlags; clients: NavClient[] }) {
  const whiteLabel = branding.displayName !== 'Rival Monday';
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3.5 py-[22px] lg:flex">
      <div className="px-2.5 pb-[18px]">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.displayName} className="h-8 w-auto" />
        ) : (
          <Wordmark name={whiteLabel ? branding.displayName : undefined} />
        )}
      </div>
      <SidebarNav flags={flags} clients={clients} />
      <div className="px-3 pt-4 text-[11px] text-muted-ink">{branding.displayName}</div>
    </aside>
  );
}
