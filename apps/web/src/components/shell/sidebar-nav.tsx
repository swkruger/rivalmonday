'use client';

import { Activity, BadgeDollarSign, Bell, BookMarked, BookOpen, Building2, ClipboardCheck, Coins, CreditCard, FileText, Gauge, Globe, HeartPulse, Inbox, LayoutDashboard, Layers, Link2, ListChecks, UserPlus, MapPin, Megaphone, MessageCircle, Network, Palette, Plug, Scale, Send, Settings, ShieldCheck, Siren, SlidersHorizontal, Star, Swords, Tags, Telescope, TrendingUp, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { activeHref, type IconKey, NAV_CTX_COOKIE, type NavCounts, type NavItem, type NavRoleFlags, navFor } from './nav-items';
import { type NavClient, type NavFallback, useNavContext } from './use-nav-context';

export type { NavClient, NavFallback };

const ICONS = {
  clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords,
  changes: Activity, moves: TrendingUp, pricing: BadgeDollarSign, ads: Megaphone, rankings: MapPin, reputation: Star, approvals: ClipboardCheck, alerts: Siren, recommendations: ListChecks, usage: Gauge, runbook: BookOpen, reviews: Scale, topics: Tags, prospects: Telescope, alertRules: SlidersHorizontal, ai: Plug, ask: MessageCircle, knowledge: BookMarked,
  platform: Globe, agencies: Network, health: HeartPulse, costs: Coins, platformAccess: ShieldCheck, billing: CreditCard, leads: UserPlus, intake: Link2, briefs: FileText, settings: Settings, catalogue: Layers,
} as const satisfies Record<IconKey, unknown>;

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? 'relative flex items-center gap-2.5 rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-soft-text before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary'
          : 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-muted-surface hover:text-ink'
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

/** 30 days, path `/`, SameSite=Lax (spec §2.1); the value is `platform`, `agency` or `client:<uuid>` — no secrets. */
const COOKIE_ATTRS = 'path=/; max-age=2592000; samesite=lax';

/**
 * Client component so the active highlight and client-scoped items (`/c/<id>`, `/c/<id>/briefs`) track the live URL.
 * The App Router layout that renders `Sidebar` is preserved (not re-rendered) across client-side navigation, so a
 * server-computed path/clientId goes stale the moment a link is clicked — `usePathname()` re-runs this component on
 * every navigation instead.
 *
 * Phase 15a §2.1: one context's grouped menu (`navFor`); the context comes from `useNavContext` (shared with the
 * context switcher). This component writes the `rm_nav_ctx` cookie on every contextual page.
 */
export function SidebarNav({ flags, counts, zone, fallback, clients }: { flags: NavRoleFlags; counts: NavCounts; zone?: 'platform'; fallback: NavFallback | null; clients: NavClient[] }) {
  const { active, context, clientId, remember: value } = useNavContext({ flags, zone, fallback, clients });
  useEffect(() => {
    if (value) document.cookie = `${NAV_CTX_COOKIE}=${value}; ${COOKIE_ATTRS}`;
  }, [value]);
  const sections = navFor(context, flags, clientId, counts);
  const current = activeHref(sections, active);
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {sections.map((s) => {
        const className = `flex flex-col gap-0.5${s.placement === 'foot' ? ' mt-auto border-t border-border pt-4' : ''}`;
        const links = s.items.map((item) => <NavLink key={item.href} item={item} current={item.href === current} />);
        // Only a labelled section is a named group; an unnamed `role="group"` is noise for screen readers.
        return s.label ? (
          <div key={s.id} role="group" aria-label={s.label} className={className}>
            <SectionLabel>{s.label}</SectionLabel>
            {links}
          </div>
        ) : (
          <div key={s.id} className={className}>{links}</div>
        );
      })}
    </nav>
  );
}
