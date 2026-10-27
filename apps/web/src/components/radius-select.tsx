import { nativeSelectClass } from '@cs/ui';
import type { SelectHTMLAttributes } from 'react';
import { radiusKmFromMiles, radiusOptions } from '@/lib/format';

const selectClass = `${nativeSelectClass} w-32`;

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
