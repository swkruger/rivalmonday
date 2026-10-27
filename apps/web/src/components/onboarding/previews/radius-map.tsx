import { MapBackdrop, Pin } from './listing-map';

const W = 620;
const H = 400;
const R = 150;

/**
 * Client step 3 preview: the area searched for rivals. The circle keeps its size and the streets zoom out as the radius
 * grows (10 miles is the drawn scale), so a change in the radius select visibly redraws the map.
 */
export function RadiusMap({ miles, business }: { miles: number; business: string }) {
  const cx = W / 2;
  const cy = H / 2;
  return (
    <MapBackdrop width={W} height={H} zoom={10 / Math.max(miles, 1)}>
      <circle cx={cx} cy={cy} r={R} fill="#2A6BAC" fillOpacity=".08" stroke="#2A6BAC" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke="#2A6BAC" strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x={cx + R / 2 - 22} y={cy - 22} width="44" height="20" rx="4" fill="#fff" />
      <text x={cx + R / 2} y={cy - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#2A6BAC" fontFamily="Inter, sans-serif">{miles} mi</text>
      <Pin x={cx} y={cy + 26} />
      <title>{`${business || 'The business'}: ${miles} mile search area`}</title>
    </MapBackdrop>
  );
}
