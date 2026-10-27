import type { SelectHTMLAttributes } from 'react';
import { radiusKmFromMiles, radiusOptions } from '@/lib/format';

const selectClass = 'h-9 w-32 rounded-sm border border-input bg-surface px-3 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink';

/** The radius a new service area starts with: 10 mi, as stored km. */
export const DEFAULT_RADIUS_KM = String(radiusKmFromMiles(10));

/**
 * Radius picker shown in miles; the option value is the stored kilometres (`radiusKm` stays the form field). A stored
 * radius that matches no choice shows as a leading "≈ N mi (custom)" option carrying the exact km, so an untouched
 * field re-submits it unchanged.
 */
export function RadiusSelect({ storedKm, ...rest }: { storedKm: number | null } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'className'>) {
  return (
    <select {...rest} className={selectClass}>
      {radiusOptions(storedKm).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
