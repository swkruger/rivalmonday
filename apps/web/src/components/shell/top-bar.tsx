import type { Viewer } from '@/server/viewer';
import { AvatarMenu } from './avatar-menu';
import { ContextName, type SwitcherProps } from './context-switcher';
import { GuestSignOutButton } from './guest-sign-out-button';
import { InboxBell } from './inbox-bell';

/**
 * 68px white bar (docs/brand/mockups/01-client-overview.html `.top`). Spec §2.9: the context switcher lives in the
 * sidebar now; below `lg` (no sidebar) the bar names the current context next to the drawer button.
 */
export function TopBar({
  viewer,
  switcher,
  unread,
  menu,
  supportEmail = null,
}: {
  viewer: Exclude<Viewer, { kind: 'member-less' }>;
  switcher: SwitcherProps;
  unread: number;
  menu?: React.ReactNode;
  /** 7c2: "Send feedback" in the avatar menu; the shell sets it for agency roles only. */
  supportEmail?: string | null;
}) {
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[1560px] items-center gap-3.5 px-4 lg:px-7">
        {menu}
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
    </header>
  );
}
