import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ServiceArea } from '@cs/db';
import type { DiscoveryConfig } from '@cs/verticals';
import type { Candidate } from '../filters';

export const candidates = (): Candidate[] =>
  JSON.parse(readFileSync(fileURLToPath(new URL('./mccoy-candidates.json', import.meta.url)), 'utf8')) as Candidate[];

export const pack: DiscoveryConfig = {
  seed_keywords: ['dentist'],
  categories: ['Dentist', 'Dental clinic'],
  related_categories: ['Orthodontist', 'Oral and maxillofacial surgeon'],
  grid: { size: 5, fallback_size: 3 },
  shortlist: 20,
  cost_cap_usd: 3,
  tiers: { top: { overlap: 0.6, activity: 0.5 }, watch: { overlap: 0.3, activity: 0.3 } },
};

export const area: ServiceArea = { center: { lat: 32.4421, lng: -97.7942 }, radiusKm: 15, zips: ['76048'] };
export const self = { placeId: 'p-self', cid: null, domain: null, phone: '(817) 555-0100' };
