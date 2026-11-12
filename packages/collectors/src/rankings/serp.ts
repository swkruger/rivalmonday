import type { CallScope } from '@cs/core';
import type { SerpLocalServices, SerpOrganicItem } from '@cs/db';
import { z } from 'zod';
import { type DataForSeoClient, DFS_US, isDfsOk, isNoResults, isRetryableDfsCode, VendorError } from '../vendors/dataforseo';

/** Measured live price of one organic advanced call (Task 0, 2026-11-10; no AI-answer flag). */
export const SERP_CALL_USD = 0.002;
export const SERP_OPERATION = '/serp/google/organic/live/advanced';
const SERP_DEPTH = 10;
const RADIUS_M = { min: 199, max: 199_999 } as const;

/** The knowledge panel's name and its "Events" rows (venue pages, 18d). */
export interface SerpKnowledge { title: string | null; events: { title: string; subtitle: string | null; url: string | null }[] }
export interface SerpResult {
  organic: SerpOrganicItem[];
  localServices: SerpLocalServices | null;
  knowledge: SerpKnowledge | null;
}
export const PANEL_EVENTS_MAX = 3;

/** `google.com/goto?url=<target>` to the http(s) target; anything else (or a non-http(s) target) is null. */
export function gotoTarget(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) || u.pathname !== '/goto') return null;
    const t = u.searchParams.get('url');
    return t && /^https?:\/\//i.test(t) ? t : null;
  } catch { return null; }
}
const panelUrl = (url: string | null | undefined): string | null => {
  const g = gotoTarget(url);
  if (g) return g;
  return url && /^https?:\/\//i.test(url) && !/^https?:\/\/([^/]*\.)?google\.[a-z.]+\/goto/i.test(url) ? url : null;
};

const knowledgeSchema = z.looseObject({ type: z.literal('knowledge_graph'), title: z.string().nullish(), items: z.array(z.unknown()).nullish() });
const knowledgeListSchema = z.looseObject({ type: z.literal('knowledge_graph_list_item'), title: z.string().nullish(), items: z.array(z.unknown()).nullish() });
const knowledgeRowSchema = z.looseObject({ title: z.string().nullish(), subtitle: z.string().nullish(), url: z.string().nullish() });

const organicSchema = z.looseObject({
  type: z.literal('organic'),
  rank_group: z.number(),
  domain: z.string().nullish(),
  url: z.string().nullish(),
  title: z.string().nullish(),
  breadcrumb: z.string().nullish(),
  website_name: z.string().nullish(),
  description: z.string().nullish(),
});

const localServicesSchema = z.looseObject({
  type: z.literal('local_services'),
  title: z.string().nullish(),
  items: z.array(z.unknown()).nullish(),
});

const providerSchema = z.looseObject({
  title: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
});

/** Vendor `website_name` (text before " · ") to the host it names, for results whose breadcrumb is not a URL. */
export const WEBSITE_NAME_HOSTS: Record<string, string> = {
  Facebook: 'facebook.com',
  Yelp: 'yelp.com',
  "Angie's List": 'angi.com',
  Angi: 'angi.com',
  'Better Business Bureau': 'bbb.org',
  BBB: 'bbb.org',
  'Yellow Pages': 'yellowpages.com',
  YP: 'yellowpages.com',
  Manta: 'manta.com',
  Foursquare: 'foursquare.com',
  MapQuest: 'mapquest.com',
  HomeAdvisor: 'homeadvisor.com',
  Thumbtack: 'thumbtack.com',
  Houzz: 'houzz.com',
  Porch: 'porch.com',
  Nextdoor: 'nextdoor.com',
};

const CRUMB_URL = /^https?:\/\/([^\s›]+)(\s*›\s*(.+))?$/;

/** The real host of a Google result: the vendor `url`/`domain` are a google.com goto wrapper, the site is only in the breadcrumb or website name. Path is dropped when the crumb is truncated. */
export function organicHost(o: { breadcrumb?: string | null; website_name?: string | null; domain?: string | null }): { host: string | null; path: string | null } {
  const m = CRUMB_URL.exec((o.breadcrumb ?? '').trim());
  if (m) {
    const host = m[1]!.split(/[/?#:]/)[0]!.toLowerCase().replace(/^www\./, '');
    const segments = (m[3] ?? '').split(/\s*›\s*/).map((x) => x.trim()).filter(Boolean);
    const truncated = segments.some((x) => x.includes('…') || x.includes('...'));
    return { host, path: segments.length && !truncated ? segments.join('/') : null };
  }
  const name = (o.website_name ?? '').split(/\s+·\s+/)[0]!.trim();
  const mapped = Object.hasOwn(WEBSITE_NAME_HOSTS, name) ? WEBSITE_NAME_HOSTS[name]! : null;
  return { host: mapped, path: null };
}

/** Pure parse of a `serp/google/organic/live/advanced` task `result` array (or the whole result[0]) into page-one organic items and the Local Services ads block. */
export function parseSerp(raw: unknown, max = SERP_DEPTH): SerpResult {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const items = (first as { items?: unknown } | null | undefined)?.items;
  const list = Array.isArray(items) ? items : [];
  const organic: SerpOrganicItem[] = [];
  let localServices: SerpLocalServices | null = null;
  let knowledge: SerpKnowledge | null = null;
  for (const item of list) {
    if (!knowledge) {
      const k = knowledgeSchema.safeParse(item);
      if (k.success) {
        const events: SerpKnowledge['events'] = [];
        for (const li of k.data.items ?? []) {
          const l = knowledgeListSchema.safeParse(li);
          if (!l.success || l.data.title?.trim().toLowerCase() !== 'events') continue;
          for (const row of l.data.items ?? []) {
            const r = knowledgeRowSchema.safeParse(row);
            const title = r.success ? r.data.title?.trim() : undefined;
            if (!r.success || !title || events.length >= PANEL_EVENTS_MAX) continue;
            events.push({ title, subtitle: r.data.subtitle?.trim() || null, url: panelUrl(r.data.url) });
          }
          break;
        }
        knowledge = { title: k.data.title?.trim() || null, events };
        continue;
      }
    }
    const o = organicSchema.safeParse(item);
    if (o.success) {
      if (organic.length < max) {
        const { host, path } = organicHost({ breadcrumb: o.data.breadcrumb, website_name: o.data.website_name });
        organic.push({
          rank: o.data.rank_group,
          domain: host ?? o.data.domain ?? null,
          url: o.data.url ?? null,
          title: o.data.title ?? null,
          description: o.data.description ?? null,
          listingUrl: host ? `https://${host}${path ? `/${path}` : ''}` : null,
        });
      }
      continue;
    }
    if (localServices) continue;
    const l = localServicesSchema.safeParse(item);
    if (!l.success) continue;
    const providers: SerpLocalServices['providers'] = [];
    for (const p of l.data.items ?? []) {
      const pp = providerSchema.safeParse(p);
      const name = pp.success ? pp.data.title?.trim() : undefined;
      if (!pp.success || !name) continue;
      providers.push({ name, rating: pp.data.rating?.value ?? null, votes: pp.data.rating?.votes_count ?? null });
    }
    localServices = { title: l.data.title ?? null, providers };
  }
  return { organic, localServices, knowledge };
}

/** One live Google search (page one, desktop) centred on the service area; `raw` is the vendor result array for evidence. */
export async function serpSearch(
  dfs: DataForSeoClient,
  q: { keyword: string; lat: number; lng: number; radiusM: number; tag?: string },
  scope: CallScope,
): Promise<SerpResult & { raw: unknown[] }> {
  const radiusM = Math.min(RADIUS_M.max, Math.max(RADIUS_M.min, Math.round(q.radiusM)));
  const [task] = await dfs.post(
    SERP_OPERATION,
    [{ keyword: q.keyword, location_coordinate: `${q.lat},${q.lng},${radiusM}`, language_code: DFS_US.language_code, depth: SERP_DEPTH, ...(q.tag ? { tag: q.tag } : {}) }],
    scope,
  );
  // No task back is an error, not "nobody ranks here".
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (isNoResults(task)) return { organic: [], localServices: null, knowledge: null, raw: [] };
  if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  const raw = task.result ?? [];
  return { ...parseSerp(raw), raw };
}
