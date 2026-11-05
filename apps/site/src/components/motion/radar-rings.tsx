/**
 * The hero radar's rings without the sweep or blips: a quiet echo of the motif for other surfaces. Static and decorative
 * (`aria-hidden`, never clickable). `quadrant` draws only the quarter below-left of the centre, so the centre sits on
 * the box's top-right corner. Stroke colour comes from `className` (`stroke-primary` on ink, `stroke-secondary` on the sheet).
 */
export function RadarRings({ className, quadrant = false }: { className?: string; quadrant?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox={quadrant ? '0 550 550 550' : '0 0 1100 1100'} fill="none" className={`pointer-events-none ${className ?? ''}`}>
      <circle cx="550" cy="550" r="140" strokeOpacity=".30" />
      <circle cx="550" cy="550" r="260" strokeOpacity=".22" />
      <circle cx="550" cy="550" r="380" strokeOpacity=".15" />
      <circle cx="550" cy="550" r="500" strokeOpacity=".09" />
      <path d="M550 50v1000M50 550h1000" strokeOpacity=".09" />
    </svg>
  );
}
