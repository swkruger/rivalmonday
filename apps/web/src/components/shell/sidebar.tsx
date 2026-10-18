import type { Branding } from '@cs/email';
import { Wordmark } from '@cs/ui';
import type { NavCounts, NavRoleFlags } from './nav-items';
import { type NavClient, type NavFallback, SidebarNav } from './sidebar-nav';

/**
 * 232px white column (docs/brand/mockups/01-client-overview.html `.side`). `branding.logoUrl` is only ever `https`
 * or `null` (Review Focus 5 — resolveBranding strips anything else before this prop exists).
 *
 * Stays a server component for the logo/wordmark/footer, which only depend on `branding`. The nav list itself is
 * `SidebarNav`, a 'use client' component: `Sidebar` lives in the App Router layout, which is NOT re-rendered across
 * client-side navigation, so anything here that must track the current URL (the active highlight, the
 * client-scoped items) has to read it live via `usePathname()` instead of a prop computed once on the server.
 */
/**
 * `offsetTop`: a fixed 36px support banner sits above the shell (Phase 8b), so the sticky column starts below it.
 * `zone="platform"`: `AppShell` already passes Rival Monday `branding`; the footer reads "Platform" instead of a name.
 * `clients` is for the context switcher (15a Task 5).
 */
export function Sidebar({ branding, flags, counts, zone, fallback, offsetTop = false }: { branding: Branding; flags: NavRoleFlags; counts: NavCounts; zone?: 'platform'; fallback: NavFallback | null; clients: NavClient[]; offsetTop?: boolean }) {
  const whiteLabel = branding.displayName !== 'Rival Monday';
  return (
    <aside className={`sticky ${offsetTop ? 'top-9 h-[calc(100vh-2.25rem)]' : 'top-0 h-screen'} hidden w-[232px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-surface px-3.5 py-[22px] lg:flex`}>
      <div className="px-2.5 pb-[18px]">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.displayName} className="h-8 w-auto" />
        ) : (
          <Wordmark name={whiteLabel ? branding.displayName : undefined} />
        )}
      </div>
      <SidebarNav flags={flags} counts={counts} zone={zone} fallback={fallback} />
      <div className="px-3 pt-4 text-[11px] text-muted-ink">{zone === 'platform' ? 'Platform' : branding.displayName}</div>
    </aside>
  );
}
