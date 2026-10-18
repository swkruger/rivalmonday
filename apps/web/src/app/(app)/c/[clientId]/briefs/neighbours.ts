/**
 * Previous / Next on the brief, alert and report pages (15a §2.8): the neighbours of `id` in its list tool's order
 * (newest first), so "Previous" is the older item and "Next" the newer one. A missing end, an id outside the loaded
 * page or a list that failed to load (`null`) hides that link.
 */
export function neighbours(items: readonly { id: string }[] | null, id: string, href: (id: string) => string): { previous: string | null; next: string | null } {
  const at = items ? items.findIndex((i) => i.id === id) : -1;
  if (!items || at < 0) return { previous: null, next: null };
  const older = items[at + 1];
  const newer = at > 0 ? items[at - 1] : undefined;
  return { previous: older ? href(older.id) : null, next: newer ? href(newer.id) : null };
}
