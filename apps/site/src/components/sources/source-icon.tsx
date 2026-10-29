import { Briefcase, Globe, Grid3x3, MapPin, Megaphone, Star } from 'lucide-react';
import type { Source } from '../../../content/sources';

const ICONS = { globe: Globe, star: Star, 'map-pin': MapPin, megaphone: Megaphone, grid: Grid3x3, briefcase: Briefcase } as const;

/** Our own line icon for a source. Inline SVG only: no vendor logos. */
export function SourceIcon({ icon, className = 'size-6' }: { icon: Source['icon']; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden="true" className={`${className} shrink-0 text-secondary`} />;
}
