import { RadarRings } from '../motion/radar-rings';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';

/** Faint rings only, behind the copy and the pictures. Decorative, never clickable. */
function Radar() {
  return (
    <div aria-hidden="true" className="radar -right-64 -top-30 size-275 opacity-55 max-lg:-right-150">
      <RadarRings className="absolute inset-0 size-full stroke-primary" />
    </div>
  );
}

/** The ink first screen shared by the agency hero and the home chooser: night map, veil, still radar and the two-column grid (copy, then picture). */
export function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <section data-slot="hero" className="relative overflow-hidden bg-ink">
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
      <div aria-hidden="true" className="night-veil absolute inset-0" />
      <Radar />
      <div className="site-container relative grid items-center gap-12 pb-16 pt-9 sm:pt-14 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-20">{children}</div>
    </section>
  );
}
