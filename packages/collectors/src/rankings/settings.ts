import { createHash } from 'node:crypto';
import type { LatLng } from '@cs/core';
import type { ClientRow } from '@cs/db';

export const RANK_MAX_KEYWORDS = 5;
export const RANK_RADIUS_KM = { min: 2, max: 40 } as const;

export type RankClient = Pick<ClientRow, 'keywords' | 'rankKeywords' | 'rankGridSize' | 'serviceArea'>;

/** Rank keywords still present in client.keywords; falls back to the first 5 client keywords. */
export function rankKeywordsFor(c: Pick<RankClient, 'keywords' | 'rankKeywords'>): string[] {
  const chosen = c.rankKeywords.filter((k) => c.keywords.includes(k)).slice(0, RANK_MAX_KEYWORDS);
  return chosen.length > 0 ? chosen : c.keywords.slice(0, RANK_MAX_KEYWORDS);
}

export function rankRadiusKm(radiusKm: number): number {
  return Math.min(RANK_RADIUS_KM.max, Math.max(RANK_RADIUS_KM.min, radiusKm));
}

/** sha256 hex of canonical JSON (fixed key order) so equal settings hash equally. */
export function rankMapSettingsHash(s: { center: LatLng; radiusKm: number; gridSize: number }): string {
  const canonical = JSON.stringify({ center: { lat: s.center.lat, lng: s.center.lng }, gridSize: s.gridSize, radiusKm: s.radiusKm });
  return createHash('sha256').update(canonical).digest('hex');
}
