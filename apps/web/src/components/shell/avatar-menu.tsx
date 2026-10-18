import type { Role } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@cs/ui';
import Link from 'next/link';
import { switchMembership } from '@/app/(app)/actions';
import { SignOutButton } from '@/components/sign-out-button';
import type { Viewer } from '@/server/viewer';

/** Spec §2.9 (ruling): the account menu's role names; the team page's "Admin" is scoped to one agency already. */
const ROLE_LABELS: Record<Role, string> = { agency_admin: 'Agency admin', account_manager: 'Account manager', client_owner: 'Client owner', client_viewer: 'Client viewer' };

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || label[0] || '?').toUpperCase();
}

/** "{role} · {agency}" for agency roles; "{role} · {client}" for client roles. */
function roleLine(m: MembershipSummary): string {
  return `${ROLE_LABELS[m.role]} · ${m.clientName ?? m.agencyName}`;
}

/**
 * Spec §2.9: name, role line, Notification settings, Switch account (one `switchMembership` form per *other*
 * membership — the action sets the cookie, no write tool; never rendered for support viewers, who have no
 * memberships here), Sign out. Help joins in 15b. A support viewer is a signed-in operator, so it gets the real
 * sign-out (which also ends the session, Phase 8b M2); its own notification settings 404 there, so no link.
 * Guests never reach this (they keep `GuestSignOutButton`).
 */
export function AvatarMenu({ viewer }: { viewer: Extract<Viewer, { kind: 'user' } | { kind: 'support' }> }) {
  const others = viewer.kind === 'user' ? viewer.memberships.filter((m) => m.id !== viewer.membership.id) : [];
  const line = viewer.kind === 'user' ? roleLine(viewer.membership) : `Support session · ${viewer.session.agencyName}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full bg-secondary font-bold text-white">
        {initials(viewer.name || viewer.email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate font-semibold text-ink">{viewer.name || viewer.email}</span>
          <span className="truncate text-xs text-muted-ink">{line}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {viewer.kind === 'user' && (
          <DropdownMenuItem asChild>
            <Link href="/settings/notifications">Notification settings</Link>
          </DropdownMenuItem>
        )}
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-ink">Switch account</DropdownMenuLabel>
            {others.map((m) => (
              <form key={m.id} action={switchMembership}>
                <input type="hidden" name="membershipId" value={m.id} />
                <DropdownMenuItem asChild>
                  <button type="submit" className="flex w-full flex-col items-start gap-0 text-left">
                    <span className="truncate">{m.clientName ?? m.agencyName}</span>
                    <span className="truncate text-xs text-muted-ink">{m.clientName ? roleLine({ ...m, clientName: null }) : ROLE_LABELS[m.role]}</span>
                  </button>
                </DropdownMenuItem>
              </form>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <SignOutButton />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
