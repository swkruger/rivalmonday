import { ContextSwitcher, type SwitcherProps } from './context-switcher';
import type { NavCounts, NavRoleFlags } from './nav-items';
import { type NavClient, type NavFallback, SidebarNav } from './sidebar-nav';

/**
 * 240px canvas column (no border; part of the canvas frame) (playbook 09 § 5.1 / Frame 2), sticky under the full-width top
 * bar at `--rm-shell-top` (banner + 48px bar, set by `AppShell`), scrolling on its own. 2026-11-03 (owner): the agency
 * brand moved to the top bar, and the footer name went with it (the agency name showed twice).
 *
 * The nav list is `SidebarNav`, a 'use client' component: `Sidebar` lives in the App Router layout, which is NOT
 * re-rendered across client-side navigation, so anything here that must track the current URL (the active highlight, the
 * client-scoped items) has to read it live via `usePathname()` instead of a prop computed once on the server.
 * `clients` (the viewer's own clients) validates a remembered client. `switcher`: the context switcher at the top
 * (spec §2.4); this copy answers Cmd/Ctrl+K.
 */
export function Sidebar({ flags, counts, zone, fallback, clients, switcher }: { flags: NavRoleFlags; counts: NavCounts; zone?: 'platform'; fallback: NavFallback | null; clients: NavClient[]; switcher: SwitcherProps }) {
  return (
    <aside className="sticky top-(--rm-shell-top) hidden h-[calc(100vh-var(--rm-shell-top))] w-[240px] flex-shrink-0 flex-col gap-1 overflow-y-auto bg-canvas px-3 py-2 lg:flex">
      <div className="pb-4">
        <ContextSwitcher {...switcher} hotkey />
      </div>
      <SidebarNav flags={flags} counts={counts} zone={zone} fallback={fallback} clients={clients} backNames={{ agency: switcher.agencyName, clients: switcher.clients }} />
    </aside>
  );
}
