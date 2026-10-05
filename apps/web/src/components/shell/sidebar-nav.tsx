'use client';

import { Bell, Building2, Inbox, LayoutDashboard, Palette, Send, Swords, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeHref, clientIdFromPath, type NavItem, type NavRoleFlags, navItemsFor } from './nav-items';

const ICONS = { clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords } as const satisfies Record<NavItem['icon'], unknown>;

/**
 * Client component so the active highlight and client-scoped items (`/c/<id>`, `/c/<id>/settings/delivery`) track
 * the live URL. The App Router layout that renders `Sidebar` is preserved (not re-rendered) across client-side
 * navigation, so a server-computed path/clientId goes stale the moment a link is clicked — `usePathname()` re-runs
 * this component on every navigation instead.
 */
export function SidebarNav({ flags }: { flags: NavRoleFlags }) {
  const pathname = usePathname();
  const active = pathname.split(/[?#]/)[0]!;
  const items = navItemsFor(flags, clientIdFromPath(active));
  const current = activeHref(items, active);
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.href === current
                ? 'flex items-center gap-[11px] rounded-[9px] bg-primary-soft px-3 py-2.5 font-semibold text-primary-soft-text'
                : 'flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 font-medium text-[#475569] hover:bg-muted-surface'
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
