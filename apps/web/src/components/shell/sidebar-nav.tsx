'use client';

import { Activity, BadgeDollarSign, Bell, BookMarked, BookOpen, Building2, ClipboardCheck, Coins, CreditCard, FileText, Gauge, Globe, HeartPulse, Inbox, LayoutDashboard, Layers, Link2, ListChecks, UserPlus, MapPin, Megaphone, MessageCircle, Network, Palette, Plug, Scale, Send, Settings, ShieldCheck, Siren, SlidersHorizontal, Star, Swords, Tags, Telescope, TrendingUp, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { activeHref, currentSettingsHref, type IconKey, NAV_CTX_COOKIE, type NavCounts, type NavItem, type NavRoleFlags, type NavSection, navFor, type SettingsArea, settingsAreaOf, settingsNavFor } from './nav-items';
import { SettingsDrillIn } from './settings-drill-in';
import { type NavClient, type NavFallback, useNavContext } from './use-nav-context';

export type { NavClient, NavFallback };

const ICONS = {
  clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send, profile: Building2, competitors: Swords,
  changes: Activity, moves: TrendingUp, pricing: BadgeDollarSign, ads: Megaphone, rankings: MapPin, reputation: Star, approvals: ClipboardCheck, alerts: Siren, recommendations: ListChecks, usage: Gauge, runbook: BookOpen, reviews: Scale, topics: Tags, prospects: Telescope, alertRules: SlidersHorizontal, ai: Plug, ask: MessageCircle, knowledge: BookMarked,
  platform: Globe, agencies: Network, health: HeartPulse, costs: Coins, platformAccess: ShieldCheck, billing: CreditCard, leads: UserPlus, intake: Link2, briefs: FileText, settings: Settings, catalogue: Layers,
} as const satisfies Record<IconKey, unknown>;

/** D-04 item grammar (09 § 5.1). Exported so the drill-in settings nav reuses the same classes. */
export const NAV_ITEM_CLASS = 'flex h-8 items-center gap-2.5 rounded-sm px-2 text-13 font-medium text-ink-secondary hover:bg-muted-surface';
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
 *
 * 16b (P3): on `/agency/settings[/…]` and `/c/<id>/settings[/…]` the menu is replaced by the drill-in settings nav —
 * the same tabs as the settings layouts (same flags ⇒ same tabs; `flags.clientBilling` is the shell's owner-Billing
 * rule) plus "Back to {name}" (P4; names from `backNames`, the switcher's agency name and clients). A viewer with no
 * tab there (a guest) keeps the normal menu.
 */
export function SidebarNav({ flags, counts, zone, fallback, clients, backNames }: { flags: NavRoleFlags; counts: NavCounts; zone?: 'platform'; fallback: NavFallback | null; clients: NavClient[]; backNames?: { agency: string; clients: NavClient[] } }) {
  const { active, context, clientId, remember: value } = useNavContext({ flags, zone, fallback, clients });
  useEffect(() => {
    if (value) document.cookie = `${NAV_CTX_COOKIE}=${value}; ${COOKIE_ATTRS}`;
  }, [value]);
  const area = zone === 'platform' ? null : settingsAreaOf(active);
  const settings = area ? settingsSectionsFor(area, flags) : [];
  if (area && settings.length) {
    return <SettingsDrillIn sections={settings} current={currentSettingsHref(settings, active)} back={backLinkFor(area, backNames)} />;
  }
  const sections = navFor(context, flags, clientId, counts);
  const current = activeHref(sections, active);
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {sections.map((s) => {
        const className = `flex flex-col gap-0.5${s.placement === 'foot' ? ' mt-auto border-t border-line pt-4' : ''}`;
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

/** Mirrors the settings layouts: agency tabs for agency roles; client tabs for signed-in users and agency roles (never guests). */
function settingsSectionsFor(area: SettingsArea, flags: NavRoleFlags): NavSection[] {
  if (area.area === 'agency') return settingsNavFor('agency', flags);
  return flags.isUser || flags.isAgency ? settingsNavFor('client', flags, area.clientId) : [];
}

/** P4 (decided copy): "Back to {client name}" → `/c/<id>`, "Back to {agency name}" → `/agency`; the menus' root labels when the name is unknown. */
function backLinkFor(area: SettingsArea, names: { agency: string; clients: NavClient[] } | undefined): { href: string; label: string } {
  if (area.area === 'agency') return { href: '/agency', label: `Back to ${names?.agency.trim() || 'Portfolio'}` };
  const name = names?.clients.find((c) => c.id === area.clientId)?.name.trim();
  return { href: `/c/${area.clientId}`, label: `Back to ${name || 'Overview'}` };
}
