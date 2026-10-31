import { Wordmark } from '@cs/ui';

/** "CS Dev Verification Agency" → "CD": the tile that stands in until the agency adds a logo. */
export const brandInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/**
 * Top of the sidebar and the mobile menu. A white-label agency gets its logo (or initials) and its whole name, which wraps
 * instead of clipping, so the row grows with the name. Rival Monday itself keeps the wordmark. `logoUrl` is only ever `https`
 * or `null` (resolveBranding strips anything else). The tile is neutral, so it stays readable with any brand colour.
 */
export function ShellBrand({ displayName, logoUrl, whiteLabel }: { displayName: string; logoUrl: string | null; whiteLabel: boolean }) {
  if (!whiteLabel && !logoUrl) {
    return (
      <div className="flex min-h-12 items-center px-2">
        <Wordmark />
      </div>
    );
  }
  return (
    <div data-slot="shell-brand" className="flex min-h-12 items-center gap-2.5 px-2 py-1.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={displayName} className="h-9 w-auto max-w-24 shrink-0 object-contain" />
      ) : (
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-13 font-semibold text-secondary">
          {brandInitials(displayName)}
        </span>
      )}
      <Wordmark name={displayName} className="min-w-0 text-base leading-tight font-bold tracking-normal wrap-anywhere" />
    </div>
  );
}
