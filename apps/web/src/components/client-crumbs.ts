import type { Crumb } from './page-header';

/**
 * 15a §2.7 client breadcrumbs: the client's name (→ its Overview), then the trail — a string is plain text (a menu
 * group such as "Insights"/"Act", or the current page), a `Crumb` keeps its link.
 */
export function clientCrumbs(client: { id: string; name: string }, ...trail: (string | Crumb)[]): Crumb[] {
  return [{ label: client.name, href: `/c/${client.id}` }, ...trail.map((c) => (typeof c === 'string' ? { label: c } : c))];
}

/** Client settings tabs: `{client} › Client settings › {tab}`. */
export function clientSettingsCrumbs(client: { id: string; name: string }, tab: string): Crumb[] {
  return clientCrumbs(client, { label: 'Client settings', href: `/c/${client.id}/settings` }, tab);
}
