import type { Viewer } from '@/server/viewer';
import { AvatarMenu } from './avatar-menu';
import { ContextName, type SwitcherProps } from './context-switcher';
import { GuestSignOutButton } from './guest-sign-out-button';
import { InboxBell } from './inbox-bell';

/**
 * 48px canvas bar across the whole frame (design system v1, Frame 2; no border). 2026-11-03 (owner): full viewport width,
 * sticky at the top (at `--rm-banner-h`, under a support banner), with the agency brand at its left end in a 240px slot
 * that lines up with the sidebar, so the rest of the bar starts where the sheet starts. `z-40`: above page content and
 * the sticky SaveBar / BulkBar (z-30), under dialogs, sheets, popovers and menus (z-50). Spec §2.9: the context switcher
 * lives in the sidebar; below `lg` (no sidebar) the bar names the current context next to the drawer button and the mark.
 */
export function TopBar({
  viewer,
  switcher,
  unread,
  brand,
  menu,
  supportEmail = null,
}: {
  viewer: Exclude<Viewer, { kind: 'member-less' }>;
  switcher: SwitcherProps;
  unread: number;
  /** `ShellBrand`: the agency logo + name (Rival Monday's wordmark on platform pages). */
  brand: React.ReactNode;
  menu?: React.ReactNode;
  /** 7c2: "Send feedback" in the avatar menu; the shell sets it for agency roles only. */
  supportEmail?: string | null;
}) {
  return (
    <header data-slot="top-bar" className="sticky top-(--rm-banner-h) z-40 flex h-12 w-full flex-shrink-0 items-center bg-canvas">
      <div data-slot="top-bar-brand" className="flex min-w-0 items-center gap-1 pl-4 lg:w-[240px] lg:flex-shrink-0 lg:px-3">
        {menu}
        {brand}
      </div>
      <div className="flex min-w-0 flex-1 lg:mr-2">
        <div className="mx-auto flex w-full min-w-0 max-w-[1560px] items-center gap-3.5 pr-4 pl-2 md:pr-6 lg:px-8">
          <div className="min-w-0 lg:hidden">
            <ContextName {...switcher} />
          </div>
          <div className="flex-1" />
          {/* Phase 8b M2: no bell in a support session (the operator's own inbox 404s there). */}
          {switcher.flags.inbox !== false && <InboxBell unread={unread} />}
          {viewer.kind !== 'guest' ? (
            <AvatarMenu viewer={viewer} switcher={switcher} supportEmail={supportEmail} />
          ) : (
            // Important I1 (final review): a guest reaching "Sign out" (not "Sign in") can always end their session.
            <GuestSignOutButton />
          )}
        </div>
      </div>
    </header>
  );
}
