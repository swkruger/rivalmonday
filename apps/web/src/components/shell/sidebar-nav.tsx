'use client';

import { Activity, BadgeDollarSign, Bell, BookMarked, BookOpen, Building2, ClipboardCheck, Coins, CreditCard, FileText, Gauge, Globe, HeartPulse, Inbox, LayoutDashboard, Link2, ListChecks, UserPlus, MapPin, Megaphone, MessageCircle, Network, Palette, Plug, Scale, Send, Settings, ShieldCheck, Siren, SlidersHorizontal, Star, Swords, Tags, Telescope, TrendingUp, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeHref, clientIdFromPath, contextOf, type IconKey, type NavItem, type NavRoleFlags, navFor } from './nav-items';

const ICONS = {
  clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords,
  changes: Activity, moves: TrendingUp, pricing: BadgeDollarSign, ads: Megaphone, rankings: MapPin, reputation: Star, approvals: ClipboardCheck, alerts: Siren, recommendations: ListChecks, usage: Gauge, playbooks: BookOpen, reviews: Scale, themes: Tags, prospects: Telescope, alertRules: SlidersHorizontal, ai: Plug, ask: MessageCircle, knowledge: BookMarked,
  platform: Globe, agencies: Network, health: HeartPulse, costs: Coins, platformAccess: ShieldCheck, billing: CreditCard, leads: UserPlus, intake: Link2, briefs: FileText, settings: Settings,
} as const satisfies Record<IconKey, unknown>;

export interface NavClient {
  id: string;
  name: string;
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
      {item.pill ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span>{item.label.slice(0, item.label.length - item.pill.length).trimEnd()}</span>{' '}
          <span className="truncate rounded-full bg-amber px-2 py-px text-xs font-bold text-amber-text">{item.pill}</span>
        </span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
      {item.count ? (
        <span aria-label={`${item.count} new`} className="ml-auto rounded-full bg-amber px-2 py-px text-xs font-bold text-amber-text">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-ink">{children}</div>;
}

/**
 * Client component so the active highlight and client-scoped items (`/c/<id>`, `/c/<id>/briefs`) track the live URL.
 * The App Router layout that renders `Sidebar` is preserved (not re-rendered) across client-side navigation, so a
 * server-computed path/clientId goes stale the moment a link is clicked — `usePathname()` re-runs this component on
 * every navigation instead.
 *
 * Phase 15a: one context's grouped menu (`navFor`), chosen from the URL. Interim rendering — Task 4 adds the cookie
 * fallback, zone and real counts; `clients` is kept for the Task 5 switcher.
 */
export function SidebarNav({ flags }: { flags: NavRoleFlags; clients?: NavClient[] }) {
  const pathname = usePathname();
  const active = pathname.split(/[?#]/)[0]!;
  const context = contextOf(active, null) ?? (flags.isAgency ? 'agency' : 'client');
  const sections = navFor(context, flags, clientIdFromPath(active), { leads: flags.newLeads });
  const current = activeHref(sections, active);
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {sections.map((s) => (
        <div key={s.id} role="group" aria-label={s.label ?? undefined} className={`flex flex-col gap-0.5${s.placement === 'foot' ? ' mt-auto border-t border-border pt-4' : ''}`}>
          {s.label && <SectionLabel>{s.label}</SectionLabel>}
          {s.items.map((item) => <NavLink key={item.href} item={item} current={item.href === current} />)}
        </div>
      ))}
    </nav>
  );
}
