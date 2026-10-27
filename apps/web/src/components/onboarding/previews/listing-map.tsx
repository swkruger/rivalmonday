import type { SetupLookup } from '@cs/db';
import { formatPhone } from '@/components/place-summary';
import { formatCount } from '@/lib/format';

/** A stylised street map (no tiles: a drawing, not a service call) shared by the listing and radius previews. */
export function MapBackdrop({ width, height, zoom = 1, children }: { width: number; height: number; /** Scales the streets around the centre (the radius preview zooms out as the radius grows). */ zoom?: number; children?: React.ReactNode }) {
  const y = (f: number) => Math.round(height * f);
  return (
    <svg role="img" aria-label="Map" width="100%" viewBox={`0 0 ${width} ${height}`} className="block" style={{ maxWidth: width }}>
      <rect width={width} height={height} fill="#E9EEF3" />
      <g transform={`translate(${width / 2} ${height / 2}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}>
      <path d={`M0 ${y(0.76)} C${width * 0.19} ${y(0.7)} ${width * 0.32} ${y(0.85)} ${width * 0.52} ${y(0.8)} S${width * 0.84} ${y(0.67)} ${width} ${y(0.72)} L${width} ${height} L0 ${height} Z`} fill="#D6E6F5" />
      <g stroke="#fff" strokeLinecap="round" fill="none">
        <path d={`M0 ${y(0.36)} L${width} ${y(0.45)}`} strokeWidth="10" />
        <path d={`M${width * 0.48} 0 L${width * 0.53} ${height}`} strokeWidth="10" />
        <path d={`M0 ${y(0.12)} L${width * 0.39} ${y(0.21)} L${width * 0.68} ${y(0.09)} L${width} ${y(0.18)}`} strokeWidth="5" />
        <path d={`M${width * 0.19} 0 L${width * 0.24} ${height}`} strokeWidth="5" />
        <path d={`M${width * 0.77} 0 L${width * 0.74} ${height}`} strokeWidth="5" />
        <path d={`M0 ${y(0.6)} L${width} ${y(0.63)}`} strokeWidth="5" />
      </g>
      </g>
      {children}
    </svg>
  );
}

/** A map pin whose point is at (x, y). */
export function Pin({ x, y, fill = '#2A6BAC' }: { x: number; y: number; fill?: string }) {
  return (
    <g aria-hidden="true">
      <path d={`M${x} ${y - 24} c-12 0-21 9-21 20 c0 15 21 34 21 34 s21-19 21-34 c0-11-9-20-21-20z`} fill={fill} />
      <circle cx={x} cy={y - 4} r="7" fill="#fff" />
    </g>
  );
}

/** Client step 2 preview: the picked listing as a pin on a map, and its card. Nothing picked: the map alone and a prompt. */
export function ListingMap({ place }: { place: SetupLookup | null }) {
  const contact = place ? [place.phone && formatPhone(place.phone), place.domain].filter(Boolean).join(' · ') : '';
  return (
    <div>
      <MapBackdrop width={620} height={330}>
        {place && <Pin x={318} y={190} />}
      </MapBackdrop>
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        {place ? (
          <>
            <div className="min-w-0">
              <div className="text-base font-semibold">{place.title}</div>
              <div className="mt-1 text-[13px] text-muted-ink">{[place.category, place.address].filter(Boolean).join(' · ')}</div>
              {contact && <div className="mt-1 text-[13px] text-muted-ink">{contact}</div>}
            </div>
            {place.rating !== null && (
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold">{place.rating} ★</div>
                {place.votes !== null && <div className="text-xs text-muted-ink">{formatCount(place.votes)} reviews</div>}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-ink">Pick a listing to see it here.</p>
        )}
      </div>
    </div>
  );
}
