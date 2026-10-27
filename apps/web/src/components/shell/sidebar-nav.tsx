'use client';

import { useEffect } from 'react';
import { activeHref, clientSettingsNavFor, currentSettingsHref, NAV_CTX_COOKIE, type NavCounts, type NavRoleFlags, type NavSection, navFor, type SettingsArea, settingsAreaOf, settingsNavFor } from './nav-items';
import { NavLink, SectionLabel } from './nav-link';
import { SettingsDrillIn } from './settings-drill-in';
import { type NavClient, type NavFallback, useNavContext } from './use-nav-context';

export type { NavClient, NavFallback };

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
  return clientSettingsNavFor(flags, area.clientId);
}

/** P4 (decided copy): "Back to {client name}" → `/c/<id>`, "Back to {agency name}" → `/agency`; the menus' root labels when the name is unknown. */
function backLinkFor(area: SettingsArea, names: { agency: string; clients: NavClient[] } | undefined): { href: string; label: string } {
  if (area.area === 'agency') return { href: '/agency', label: `Back to ${names?.agency.trim() || 'Portfolio'}` };
  const name = names?.clients.find((c) => c.id === area.clientId)?.name.trim();
  return { href: `/c/${area.clientId}`, label: `Back to ${name || 'Overview'}` };
}
