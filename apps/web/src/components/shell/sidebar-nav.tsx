'use client';

import { Activity, BadgeDollarSign, Bell, BookOpen, Building2, ClipboardCheck, Gauge, Inbox, LayoutDashboard, ListChecks, Megaphone, Palette, Plug, Scale, Send, Siren, SlidersHorizontal, Star, Swords, Tags, Telescope, TrendingUp, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeHref, clientIdFromPath, type NavGroup, type NavItem, type NavRoleFlags, navItemsFor } from './nav-items';

const ICONS = {
  clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords,
  changes: Activity, moves: TrendingUp, pricing: BadgeDollarSign, ads: Megaphone, reputation: Star, approvals: ClipboardCheck, alerts: Siren, recommendations: ListChecks, usage: Gauge, playbooks: BookOpen, reviews: Scale, themes: Tags, prospects: Telescope, alertRules: SlidersHorizontal, ai: Plug,
} as const satisfies Record<NavItem['icon'], unknown>;

export interface NavClient {
  id: string;
  name: string;
}

/** Up to two initials from the client's name, skipping symbols like "&". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function NavLink({ item, current, compact = false }: { item: NavItem; current: boolean; compact?: boolean }) {
  const Icon = ICONS[item.icon];
  const size = compact ? 'py-1.5 text-[13px]' : 'py-2 text-sm';
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? `relative flex items-center gap-2.5 rounded-lg bg-primary-soft px-3 ${size} font-semibold text-primary-soft-text before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary`
          : `flex items-center gap-2.5 rounded-lg px-3 ${size} font-medium text-ink/70 transition-colors hover:bg-muted-surface hover:text-ink`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-ink">{children}</div>;
}

/**
 * Client component so the active highlight and client-scoped items (`/c/<id>`, `/c/<id>/settings/delivery`) track
 * the live URL. The App Router layout that renders `Sidebar` is preserved (not re-rendered) across client-side
 * navigation, so a server-computed path/clientId goes stale the moment a link is clicked — `usePathname()` re-runs
 * this component on every navigation instead.
 *
 * Agency staff see three sections: agency-wide pages, a panel holding the open client's pages (headed by that
 * client's name, so it's clear those pages are about one client), and their account/agency settings at the bottom.
 * Client users and guests only ever have one client, so they get the same items without section labels.
 */
export function SidebarNav({ flags, clients = [] }: { flags: NavRoleFlags; clients?: NavClient[] }) {
  const pathname = usePathname();
  const active = pathname.split(/[?#]/)[0]!;
  const clientId = clientIdFromPath(active);
  const items = navItemsFor(flags, clientId);
  const current = activeHref(items, active);
  const of = (group: NavGroup) => items.filter((i) => i.group === group);
  const links = (group: NavGroup, compact?: boolean) => of(group).map((item) => <NavLink key={item.href} item={item} current={item.href === current} compact={compact} />);

  if (!flags.isAgency) {
    return (
      <nav className="flex flex-1 flex-col gap-0.5">
        {links('client')}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">{links('account', true)}</div>
      </nav>
    );
  }

  const clientName = clientId ? clients.find((c) => c.id === clientId)?.name : undefined;
  return (
    <nav className="flex flex-1 flex-col">
      <div role="group" aria-label="Agency" className="flex flex-col gap-0.5">
        <SectionLabel>Agency</SectionLabel>
        {links('agency')}
      </div>

      {clientId ? (
        <div role="group" aria-label={clientName ? `Client: ${clientName}` : 'Client'} className="mt-5 flex flex-col gap-0.5 rounded-xl border border-line bg-muted-surface/60 p-1.5">
          <div className="flex items-center gap-2.5 px-1.5 pb-2 pt-1">
            <span aria-hidden="true" className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-secondary text-[11px] font-bold text-secondary-foreground">
              {clientName ? initials(clientName) : '·'}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-ink">Client</span>
              <span className="line-clamp-2 block break-words text-[13px] font-semibold leading-snug text-ink" title={clientName}>
                {clientName ?? 'Selected client'}
              </span>
            </span>
          </div>
          {links('client')}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-muted-ink">Select a client from Portfolio</div>
      )}

      <div role="group" aria-label="Account" className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
        <SectionLabel>Account</SectionLabel>
        {links('account', true)}
      </div>
    </nav>
  );
}
