/**
 * The assistant pill (docs/brand/brand.md): brand amber background
 * (#F5A524), #3B2300 text, weight 700. Agencies may rename the assistant.
 */
export function FridayBadge({ name = 'Friday' }: { name?: string }) {
  return <span className="rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-amber-text">{name}</span>;
}
