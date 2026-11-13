import { z } from 'zod';
import { nameHit } from '../citations/match';

export interface TripadvisorItem { id: string; url: string; title: string; rating: number | null; reviews: number | null; city: string | null }

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District_of_Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New_Hampshire','New_Jersey','New_Mexico','New_York','North_Carolina','North_Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode_Island','South_Carolina','South_Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West_Virginia','Wisconsin','Wyoming']
  .sort((a, b) => b.length - a.length);

/** "/Attraction_Review-g55765-d11750497-Reviews-Treaty_Oak_Distilling-Dripping_Springs_Texas.html" → { id: 'd11750497', city: 'Dripping Springs' } */
export function parseUrlPath(p: string | null | undefined): { id: string; city: string | null } | null {
  const m = /^\/[A-Za-z_]+_Review-g\d+-(d\d+)-(?:Reviews-)?(?:.*-)?([A-Za-z0-9_]+)\.html$/.exec((p ?? '').trim());
  if (!m) return null;
  const slug = m[2]!; const st = US_STATES.find((s) => slug === s || slug.endsWith(`_${s}`));
  const city = st ? slug.slice(0, slug.length - st.length).replace(/_$/, '') : null;
  return { id: m[1]!, city: city ? city.replace(/_/g, ' ') : null };
}

const rawItem = z.looseObject({
  title: z.string().nullish(),
  url_path: z.string().nullish(),
  is_sponsored: z.boolean().nullish(),
  rating: z.looseObject({ value: z.unknown().nullish() }).nullish(),
  reviews_count: z.unknown().nullish(),
});

/** Defensive parse of one DataForSEO tripadvisor_search_organic item; null when unusable. */
export function parseTripadvisorItem(raw: unknown): TripadvisorItem | null {
  const r = rawItem.safeParse(raw);
  if (!r.success) return null;
  const v = r.data;
  if (v.is_sponsored === true) return null;
  const title = v.title?.trim();
  if (!title) return null;
  const path = parseUrlPath(v.url_path);
  if (!path) return null;
  const value = v.rating?.value;
  const rating = typeof value === 'number' && value > 0 && value <= 5 ? value : null;
  const count = v.reviews_count;
  const reviews = typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null;
  return { id: path.id, url: `https://www.tripadvisor.com${v.url_path}`, title, rating, reviews, city: path.city };
}

export function matchTripadvisor(items: TripadvisorItem[], biz: { name: string; city: string | null }): TripadvisorItem | null {
  const named = items.filter((i) => nameHit(i.title, biz.name, biz.city));
  const local = biz.city ? named.filter((i) => i.city !== null && i.city.toLowerCase() === biz.city!.toLowerCase()) : named;
  return local.length === 1 ? local[0]! : null;
}
