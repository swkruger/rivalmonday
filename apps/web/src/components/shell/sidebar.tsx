import type { Branding } from '@cs/email';
import { Wordmark } from '@cs/ui';
import { Bell, Inbox, LayoutDashboard, Palette, Send, UserCog, Users, Webhook } from 'lucide-react';
import Link from 'next/link';
import type { NavItem } from '@/server/nav';

const ICONS = { clients: Users, overview: LayoutDashboard, inbox: Inbox, team: UserCog, branding: Palette, webhooks: Webhook, bell: Bell, delivery: Send } as const satisfies Record<NavItem['icon'], unknown>;

function isActive(href: string, active: string): boolean {
  return active === href || active.startsWith(`${href}/`);
}

/** The deepest (longest-href) matching item wins, so `/c/<id>` doesn't also light up `/c/<id>/settings/delivery`. */
function activeHref(items: NavItem[], active: string): string | null {
  const matches = items.filter((i) => isActive(i.href, active));
  return matches.length ? matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href : null;
}

/**
 * 232px white column (docs/brand/mockups/01-client-overview.html `.side`). `branding.logoUrl` is only ever `https`
 * or `null` (Review Focus 5 — resolveBranding strips anything else before this prop exists).
 */
export function Sidebar({ branding, items, active }: { branding: Branding; items: NavItem[]; active: string }) {
  const whiteLabel = branding.displayName !== 'Rival Monday';
  const current = activeHref(items, active);
  return (
    <aside className="flex w-[232px] flex-shrink-0 flex-col gap-1 border-r border-line bg-surface px-3.5 py-[22px]">
      <div className="px-2.5 pb-[18px]">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.displayName} className="h-8 w-auto" />
        ) : (
          <Wordmark name={whiteLabel ? branding.displayName : undefined} />
        )}
      </div>
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
      <div className="flex-1" />
      <div className="border-t border-line px-2.5 pt-3.5 text-xs text-muted-ink">{branding.displayName}</div>
    </aside>
  );
}
