import type { Crumb } from './page-header';

/**
 * 15a §2.7 client breadcrumbs: the client's name (→ its Overview), then the trail — a string is plain text (a menu
 * group such as "Insights"/"Act", or the current page), a `Crumb` keeps its link.
 */
export function clientCrumbs(client: { id: string; name: string }, ...trail: (string | Crumb)[]): Crumb[] {
  return [{ label: client.name, href: `/c/${client.id}` }, ...trail.map((c) => (typeof c === 'string' ? { label: c } : c))];
}

/**
 * Client settings tabs: `{client} › Client settings › {tab}`. "Client settings" links to the settings index only when
 * it serves the viewer (`hasClientSettings`); for a guest (no visible tab, so the index 404s) it is plain text.
 */
export function clientSettingsCrumbs(client: { id: string; name: string }, tab: string, linked: boolean): Crumb[] {
  return clientCrumbs(client, linked ? { label: 'Client settings', href: `/c/${client.id}/settings` } : 'Client settings', tab);
}
