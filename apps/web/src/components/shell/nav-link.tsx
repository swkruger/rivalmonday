'use client';

import { Activity, BadgeDollarSign, Bell, BookMarked, BookOpen, Building2, ClipboardCheck, Coins, CreditCard, FileText, Gauge, Globe, HeartPulse, Inbox, LayoutDashboard, Layers, Link2, ListChecks, UserPlus, MapPin, Megaphone, MessageCircle, Network, Palette, Plug, Scale, Send, Settings, ShieldCheck, Siren, SlidersHorizontal, Star, Swords, Tags, Telescope, TrendingUp, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import type { IconKey, NavItem } from './nav-items';

export const ICONS = {
  clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords,
  changes: Activity, moves: TrendingUp, pricing: BadgeDollarSign, ads: Megaphone, rankings: MapPin, reputation: Star, approvals: ClipboardCheck, alerts: Siren, recommendations: ListChecks, usage: Gauge, runbook: BookOpen, reviews: Scale, topics: Tags, prospects: Telescope, alertRules: SlidersHorizontal, ai: Plug, ask: MessageCircle, knowledge: BookMarked,
  platform: Globe, agencies: Network, health: HeartPulse, costs: Coins, platformAccess: ShieldCheck, billing: CreditCard, leads: UserPlus, intake: Link2, briefs: FileText, settings: Settings, catalogue: Layers,
} as const satisfies Record<IconKey, unknown>;

/** D-04 item grammar (09 § 5.1) plus the design-system focus outline. Shared by `SidebarNav` and `SettingsDrillIn`. */
export const NAV_ITEM_FOCUS_CLASS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const NAV_ITEM_CLASS = `flex h-8 items-center gap-2.5 rounded-sm px-2 text-13 font-medium text-ink-secondary hover:bg-muted-surface ${NAV_ITEM_FOCUS_CLASS}`;
export const NAV_ITEM_CURRENT_CLASS = 'bg-primary-soft font-semibold text-primary-soft-text hover:bg-primary-soft';

export function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      data-slot="nav-item"
      aria-current={current ? 'page' : undefined}
      className={current ? `${NAV_ITEM_CLASS} ${NAV_ITEM_CURRENT_CLASS}` : NAV_ITEM_CLASS}
    >
      <Icon className="size-4 flex-shrink-0" strokeWidth={1.75} />
      {item.pill ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span>{item.label.slice(0, item.label.length - item.pill.length).trimEnd()}</span>{' '}
          <span className="truncate rounded-full bg-amber px-2 py-px text-xs font-semibold text-amber-text">{item.pill}</span>
        </span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
      {item.count ? (
        <span data-slot="nav-count" aria-label={`${item.count} new`} className="ml-auto text-xs font-medium text-muted-ink">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 text-xs font-medium text-muted-ink">{children}</div>;
}
