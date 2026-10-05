import { type AccessContext, isAgencyRole } from '@cs/core';
import { type NavItem, type NavRoleFlags, navItemsFor } from '@/components/shell/nav-items';

export type { NavItem };

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** Reduces a viewer's `AccessContext` to the plain flags `navItemsFor` needs, so client components never import `@cs/core`. */
export function navFlagsFor(v: { kind: 'user' | 'guest'; ctx: AccessContext }): NavRoleFlags {
  return { isAgency: isAgencyRole(v.ctx.role), isAgencyAdmin: v.ctx.role === 'agency_admin', isUser: v.kind === 'user', homePath: homePath(v.ctx) };
}

/** Server-side convenience wrapper over `navItemsFor` — still used by tests and anywhere a one-shot list (not live-pathname-aware) is enough. */
export function navFor(v: { kind: 'user' | 'guest'; ctx: AccessContext }, clientId: string | null): NavItem[] {
  return navItemsFor(navFlagsFor(v), clientId);
}
