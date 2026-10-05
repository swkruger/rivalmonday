import { type AccessContext, isAgencyRole } from '@cs/core';

export interface NavItem {
  href: string;
  label: string;
  icon: 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery';
}

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** 5b/5c add their modules here; only screens that exist are listed. */
export function navFor(v: { kind: 'user' | 'guest'; ctx: AccessContext }, clientId: string | null): NavItem[] {
  const { ctx } = v;
  const items: NavItem[] = [];
  if (isAgencyRole(ctx.role)) {
    items.push({ href: '/agency', label: 'Clients', icon: 'clients' });
    if (clientId) {
      items.push({ href: `/c/${clientId}`, label: 'Overview', icon: 'overview' });
      items.push({ href: `/c/${clientId}/settings/delivery`, label: 'Delivery', icon: 'delivery' });
    }
  } else {
    items.push({ href: homePath(ctx), label: 'Overview', icon: 'overview' });
  }
  items.push({ href: '/inbox', label: 'Inbox', icon: 'inbox' });
  if (isAgencyRole(ctx.role)) items.push({ href: '/agency/team', label: 'Team', icon: 'team' });
  if (ctx.role === 'agency_admin') {
    items.push({ href: '/agency/branding', label: 'Branding', icon: 'branding' });
    items.push({ href: '/agency/webhooks', label: 'Slack & Teams', icon: 'webhooks' });
  }
  if (v.kind === 'user') items.push({ href: '/settings/notifications', label: 'Notifications', icon: 'bell' });
  return items;
}
