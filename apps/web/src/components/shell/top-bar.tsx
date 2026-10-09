import { isAgencyRole } from '@cs/core';
import type { ClientSummary } from '@cs/tools';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@cs/ui';
import { SignOutButton } from '@/components/sign-out-button';
import type { Viewer } from '@/server/viewer';
import { ClientSwitcher } from './client-switcher';
import { GuestSignOutButton } from './guest-sign-out-button';
import { InboxBell } from './inbox-bell';
import { MembershipSwitcher } from './membership-switcher';

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || label[0] || '?').toUpperCase();
}

/** 68px white bar (docs/brand/mockups/01-client-overview.html `.top`). */
export function TopBar({
  viewer,
  clients,
  clientName,
  unread,
  menu,
}: {
  viewer: Exclude<Viewer, { kind: 'member-less' }>;
  clients: ClientSummary[];
  clientName: string | null;
  unread: number;
  menu?: React.ReactNode;
}) {
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1560px] items-center gap-3.5 px-4 lg:px-7">
        {menu}
        {isAgencyRole(viewer.ctx.role) ? (
          <ClientSwitcher clients={clients} />
        ) : (
          clientName && <span className="font-semibold">{clientName}</span>
        )}
        <div className="flex-1" />
        <InboxBell unread={unread} />
        {viewer.kind === 'user' && viewer.memberships.length > 1 && (
          <MembershipSwitcher memberships={viewer.memberships} currentId={viewer.membership.id} />
        )}
        {viewer.kind === 'user' ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full bg-secondary font-bold text-white">
              {initials(viewer.name || viewer.email)}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal text-muted-ink">{viewer.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <SignOutButton />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          // Important I1 (final review): a guest reaching "Sign out" (not "Sign in") can always end their session.
          <GuestSignOutButton />
        )}
      </div>
    </header>
  );
}
