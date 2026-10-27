import { segmentedItemClass, segmentedTrackClass } from '@cs/ui';
import Link from 'next/link';

export type PlatformRange = '12w' | '12m';
const OPTIONS: { value: PlatformRange; label: string }[] = [
  { value: '12w', label: '12 weeks' },
  { value: '12m', label: '12 months' },
];

export const parseRange = (v: string | string[] | undefined): PlatformRange => (v === '12m' ? '12m' : '12w');

/** `?range=` link pair; `basePath` may already carry a query string (then `&` is used). */
export function RangeToggle({ current, basePath }: { current: PlatformRange; basePath: string }) {
  const sep = basePath.includes('?') ? '&' : '?';
  return (
    <nav aria-label="Time range" className={segmentedTrackClass}>
      {OPTIONS.map((o) => (
        <Link
          key={o.value}
          href={`${basePath}${sep}range=${o.value}`}
          aria-current={o.value === current ? 'true' : undefined}
          className={segmentedItemClass}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
