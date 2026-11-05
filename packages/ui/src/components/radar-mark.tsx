import { RADAR_MARK } from '../brand-mark';
import { cn } from '../lib/cn';

/**
 * The Rival Monday radar mark (docs/brand/brand.md): rings in `rival` blue, the sweep in `monday` amber, the same split
 * as the wordmark. Decorative beside the wordmark text (`aria-hidden`). Never shown for a white-label agency.
 */
export function RadarMark({ className }: { className?: string }) {
  return (
    <svg data-slot="radar-mark" aria-hidden="true" viewBox="0 0 64 64" fill="none" className={cn('shrink-0', className)}>
      <g className="stroke-secondary" strokeWidth="4.5">
        {RADAR_MARK.rings.map((d) => <path key={d} d={d} />)}
      </g>
      <circle cx="32" cy="32" r="3.5" className="fill-secondary" />
      <path d={RADAR_MARK.wedge} className="fill-amber stroke-amber" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
