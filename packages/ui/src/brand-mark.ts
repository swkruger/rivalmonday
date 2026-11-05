/**
 * Geometry of the Rival Monday radar mark (docs/brand/brand.md), on a 64-unit grid: ring arcs broken where the sweep
 * wedge passes (25°–60° from 12 o'clock). Plain data and SVG strings, no React, so image routes (site icons and
 * OG cards) and build scripts can use it.
 */
export const RADAR_MARK = {
  rings: ['M41.4 30.62A9.5 9.5 0 1 1 32.56 22.52', 'M49.48 25.95A18.5 18.5 0 1 1 36.51 14.06', 'M57.37 21.39A27.5 27.5 0 1 1 40.36 5.8'],
  wedge: 'M32 32L44.26 5.72A29 29 0 0 1 57.11 17.5Z',
} as const;

/** Standalone SVG markup of the bare mark in the brand colours (rings #2A6BAC, sweep #F5A524), for image renderers. */
export function radarMarkSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">',
    `<g stroke="#2A6BAC" stroke-width="4.5">${RADAR_MARK.rings.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    '<circle cx="32" cy="32" r="3.5" fill="#2A6BAC"/>',
    `<path d="${RADAR_MARK.wedge}" fill="#F5A524" stroke="#F5A524" stroke-width="1.5" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
}

/** The favicon / app-icon tile: two rings and the sweep on an ink rounded square (fewer rings so it reads at 16 px). */
const TILE = {
  rings: ['M40.85 30.36A9 9 0 1 1 32.87 23.04', 'M48.87 25.72A18 18 0 1 1 36.78 14.65'],
  wedge: 'M32 32L42.99 8.44A26 26 0 0 1 54.52 19Z',
} as const;

/** Standalone SVG markup of the tile. `rounded: false` for platforms that round icons themselves (Apple touch icon). */
export function radarTileSvg({ rounded = true }: { rounded?: boolean } = {}): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">',
    `<rect width="64" height="64"${rounded ? ' rx="14"' : ''} fill="#0B2540"/>`,
    `<g stroke="#7FC3F0" stroke-width="4.5">${TILE.rings.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    '<circle cx="32" cy="32" r="3.5" fill="#7FC3F0"/>',
    `<path d="${TILE.wedge}" fill="#F5A524" stroke="#F5A524" stroke-width="1.5" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
}
