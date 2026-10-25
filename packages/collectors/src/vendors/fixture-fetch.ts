import { createHash, randomUUID } from 'node:crypto';
import type { LedgerSink } from '@cs/core';

/**
 * 7c2 rehearsal (`VENDOR_FAKE_MODE=fixtures`): a `fetch` that answers the paid vendor APIs (DataForSEO live + sandbox,
 * Apify, ScrapeCreators, Stadia) from templates shaped like `test/fixtures/vendors/*`, at $0 and without the network.
 * Names come from the request (keyword / `fixturePlaceId` / page id) so they match the seeded competitor; answers are
 * static per request (no new reviews or ads appear between calls). Anything else answers HTTP 599.
 */

const DFS_HOSTS = new Set(['api.dataforseo.com', 'sandbox.dataforseo.com']);
/** Vendors answered by the fixture fetch; their ledger rows are zeroed by `zeroFixtureVendorCosts`. */
export const FIXTURE_VENDORS: readonly string[] = ['dataforseo', 'apify', 'scrapecreators', 'stadia'];
/** A 1×1 transparent PNG (Stadia static map stand-in). */
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
/** Fixed timestamps keep task_get answers identical across calls (no "new" reviews, ads or jobs). */
const FIXED_TS = ['2026-08-03 15:12:00 +00:00', '2026-08-19 18:40:00 +00:00', '2026-09-02 13:05:00 +00:00'] as const;

const PLACE_PREFIX = 'FX';
/** A place id that carries the business name, so `my_business_info` / reviews answers can name the seeded competitor. */
export const fixturePlaceId = (name: string): string => `${PLACE_PREFIX}${Buffer.from(name, 'utf8').toString('base64url')}`;
function nameFromPlaceId(placeId: string): string {
  if (placeId.startsWith(PLACE_PREFIX)) {
    const name = Buffer.from(placeId.slice(PLACE_PREFIX.length), 'base64url').toString('utf8');
    if (name && fixturePlaceId(name) === placeId) return name;
  }
  return `Fixture Business ${placeId.slice(0, 8)}`;
}

const hex = (s: string) => createHash('sha256').update(s).digest('hex');
/** `len` decimal digits derived from `s` (stable ids: cid, advertiser/creative/archive ids). */
const digits = (s: string, len: number) => BigInt(`0x${hex(s)}`).toString().slice(0, len).padEnd(len, '0');

type Obj = Record<string, unknown>;
interface Reply { status: number; body: unknown; headers?: Record<string, string> }
const json = (body: unknown, status = 200): Reply => ({ status, body });

function dfsEnvelope(tasks: Obj[]): Obj {
  return { version: 'fixture', status_code: 20000, status_message: 'Ok.', time: '0 sec.', cost: 0, tasks_count: tasks.length, tasks_error: 0, tasks };
}
function dfsTask(path: string, data: Obj, result: unknown[] | null, opts: { id?: string; code?: number; message?: string } = {}): Obj {
  return {
    id: opts.id ?? randomUUID(), status_code: opts.code ?? 20000, status_message: opts.message ?? 'Ok.', time: '0 sec.', cost: 0,
    result_count: result?.length ?? 0, path: ['v3', ...path.split('/').filter(Boolean)], data, result,
  };
}

function reviewsResult(data: Obj): Obj[] {
  const placeId = typeof data.place_id === 'string' ? data.place_id : null;
  const cid = typeof data.cid === 'string' ? data.cid : null;
  const name = placeId ? nameFromPlaceId(placeId) : `Fixture Business ${cid ?? ''}`.trim();
  const key = placeId ?? cid ?? name;
  const texts = [
    'Quick to schedule and the technician explained everything clearly. Fair price.',
    'Friendly team, arrived on time and cleaned up afterwards.',
    'Took a second visit to fix the problem, but they stood behind the work.',
  ];
  const items = texts.map((text, i) => ({
    type: 'google_reviews_search', rank_group: i + 1, rank_absolute: i + 1, position: 'left', xpath: null,
    review_text: text, original_review_text: null, original_language: 'en', time_ago: 'a month ago', timestamp: FIXED_TS[i],
    rating: { rating_type: 'Max5', value: i === 2 ? 3 : 5, votes_count: null, rating_max: 5 },
    reviews_count: 3 + i, photos_count: null, local_guide: false,
    profile_name: `Fixture Reviewer ${i + 1}`, profile_url: null, review_url: null, profile_image_url: null,
    owner_answer: i === 0 ? `Thank you for choosing ${name}!` : null, original_owner_answer: null,
    owner_time_ago: i === 0 ? 'a month ago' : null, owner_timestamp: i === 0 ? FIXED_TS[i] : null,
    review_id: `fx-${hex(`${key}:review:${i}`).slice(0, 32)}`, images: null, review_highlights: null,
  }));
  return [{
    keyword: placeId ? `place_id:${placeId}` : `cid:${cid}`, type: 'google_reviews', se_domain: 'google.com', location_code: 2840, language_code: 'en',
    check_url: null, datetime: FIXED_TS[2], title: name, sub_title: 'Fixture address', rating: { rating_type: 'Max5', value: 4.3, votes_count: items.length, rating_max: 5 },
    feature_id: null, place_id: placeId, cid: cid ?? digits(`${key}:cid`, 19), reviews_count: items.length, items_count: items.length, items,
  }];
}

function jobsResult(data: Obj): Obj[] {
  const employer = typeof data.keyword === 'string' ? data.keyword : 'Fixture Business';
  const titles = ['Service Technician', 'Customer Service Representative'];
  const items = titles.map((title, i) => ({
    type: 'google_jobs_item', rank_group: i + 1, rank_absolute: i + 1, position: 'right', xpath: null,
    job_id: `fx-${hex(`${employer}:job:${i}`).slice(0, 24)}`, title, employer_name: employer, employer_url: null, employer_image_url: null,
    location: 'United States', source_name: 'via Fixture Jobs', source_url: null, salary: i === 0 ? '$25–$35 an hour' : null,
    contract_type: 'Full-time', timestamp: FIXED_TS[i], time_ago: null, rectangle: null,
  }));
  return [{ keyword: employer, type: 'jobs', se_domain: 'google.com', location_code: 2840, language_code: 'en', check_url: null, datetime: FIXED_TS[2], spell: null, refinement_chips: null, item_types: ['google_jobs_item'], se_results_count: items.length, items_count: items.length, items }];
}

function gbpResult(keyword: string): Obj[] {
  const placeId = keyword.startsWith('place_id:') ? keyword.slice('place_id:'.length) : null;
  const cid = keyword.startsWith('cid:') ? keyword.slice('cid:'.length) : null;
  const name = placeId ? nameFromPlaceId(placeId) : `Fixture Business ${cid ?? keyword}`;
  const key = placeId ?? cid ?? keyword;
  const item = {
    type: 'google_business_info', rank_group: 1, rank_absolute: 1, position: 'left', title: name, original_title: null,
    description: `${name} is a locally owned service business (rehearsal fixture).`, category: 'HVAC contractor',
    additional_categories: ['Air conditioning contractor', 'Heating contractor'], cid: cid ?? digits(`${key}:cid`, 19), feature_id: null,
    address: '100 Fixture Ave, Austin, TX 78701', address_info: { borough: null, address: '100 Fixture Ave', city: 'Austin', zip: '78701', region: 'Texas', country_code: 'US' },
    place_id: placeId ?? `ChIJfx${hex(`${key}:place`).slice(0, 21)}`, phone: null, url: null, domain: null, latitude: 30.2672, longitude: -97.7431,
    is_claimed: true, rating: { rating_type: 'Max5', value: 4.3, votes_count: 3, rating_max: 5 }, attributes: null, work_time: null,
  };
  return [{ keyword, type: 'google_business_info', se_domain: 'google.com', location_code: 2840, language_code: 'en', check_url: null, datetime: FIXED_TS[2], items_count: 1, items: [item] }];
}

function mapsResult(data: Obj): Obj[] {
  const keyword = typeof data.keyword === 'string' ? data.keyword : 'fixture';
  const [lat, lng] = typeof data.location_coordinate === 'string' ? data.location_coordinate.split(',').map(Number.parseFloat) : [30.2672, -97.7431];
  const names = [keyword, `${keyword} Rival A`, `${keyword} Rival B`];
  const items = names.map((title, i) => ({
    type: 'maps_search', rank_group: i + 1, rank_absolute: i + 1, domain: null, title, url: null,
    rating: { rating_type: 'Max5', value: 4.5 - i * 0.2, votes_count: 40 - i * 10, rating_max: null }, category: 'HVAC contractor',
    additional_categories: ['Heating contractor'], address: `${100 + i} Fixture Ave, Austin, TX 78701`, address_info: { city: 'Austin' },
    place_id: fixturePlaceId(title), cid: digits(`${title}:cid`, 19), latitude: (lat ?? 30.2672) + i * 0.001, longitude: (lng ?? -97.7431) + i * 0.001,
    phone: null, is_claimed: true, work_hours: null,
  }));
  return [{ keyword, type: 'maps', se_domain: 'google.com', location_code: 2840, language_code: 'en', check_url: null, datetime: FIXED_TS[2], items_count: items.length, items }];
}

const advertiserId = (name: string) => `AR${digits(`${name}:advertiser`, 20)}`;

function adsSearchResult(data: Obj): Obj[] {
  const pinned = Array.isArray(data.advertiser_ids) ? data.advertiser_ids.filter((x): x is string => typeof x === 'string') : [];
  const target = typeof data.target === 'string' ? data.target : null;
  const sources = pinned.length > 0 ? pinned.map((id) => ({ id, title: `Fixture Advertiser ${id.slice(-6)}` })) : [{ id: advertiserId(target ?? 'none'), title: target ?? 'Fixture Advertiser' }];
  const items = sources.flatMap((s, si) => [0, 1].map((i) => {
    const creative = `CR${digits(`${s.id}:creative:${i}`, 20)}`;
    return {
      type: 'ads_search', rank_group: si * 2 + i + 1, rank_absolute: si * 2 + i + 1, advertiser_id: s.id, creative_id: creative, title: s.title,
      url: `https://adstransparency.google.com/advertiser/${s.id}/creative/${creative}?region=US`, verified: true, format: 'text',
      preview_image: { url: null, height: null, width: null }, preview_url: null, first_shown: FIXED_TS[i], last_shown: null,
    };
  }));
  return [{ keyword: target ?? pinned.join(','), type: 'ads_search', se_domain: 'adstransparency.google.com', location_code: 2840, language_code: 'en', check_url: null, datetime: FIXED_TS[2], items_count: items.length, items }];
}

function advertisersResult(data: Obj): Obj[] {
  const name = typeof data.keyword === 'string' ? data.keyword : 'Fixture Advertiser';
  const items = [{ type: 'ads_advertiser', rank_group: 1, rank_absolute: 1, title: name, advertiser_id: advertiserId(name), location: 'US', verified: true, approx_ads_count: 2 }];
  return [{ keyword: name, type: 'ads_advertisers', se_domain: 'adstransparency.google.com', location_code: 2840, language_code: 'en', check_url: null, datetime: FIXED_TS[2], items_count: 1, items }];
}

/** Meta Ad Library rows (ScrapeCreators and Apify share the shape) for one page. */
function metaAds(pageId: string, pageName: string): Obj[] {
  return [0, 1].map((i) => ({
    ad_archive_id: digits(`${pageId}:meta:${i}`, 16), collation_count: 1, collation_id: digits(`${pageId}:coll:${i}`, 16), is_active: true,
    page_id: pageId, page_is_deleted: false, start_date: FIXED_TS[i], end_date: null,
    publisher_platform: ['FACEBOOK', 'INSTAGRAM'],
    snapshot: {
      page_id: pageId, page_name: pageName, page_profile_uri: null, caption: null, cta_text: 'Learn more', display_format: 'IMAGE', cards: [], images: [], videos: [],
      title: i === 0 ? 'Seasonal tune-up' : 'Same-day service', body: { text: i === 0 ? `Book a tune-up with ${pageName}.` : `${pageName}: same-day appointments available.` }, link_url: null,
    },
  }));
}
const metaPageName = (pageId: string) => `Fixture Page ${pageId}`;
const metaPageIdFor = (name: string) => digits(`${name}:page`, 15);

type Task = { kind: 'reviews' | 'jobs'; data: Obj; ready: boolean };
const READY_PATHS: Record<string, Task['kind']> = { '/business_data/google/reviews/tasks_ready': 'reviews', '/serp/google/jobs/tasks_ready': 'jobs' };
const POST_PATHS: Record<string, Task['kind']> = { '/business_data/google/reviews/task_post': 'reviews', '/serp/google/jobs/task_post': 'jobs' };
const GET_PATH = /^\/(business_data\/google\/reviews\/task_get|serp\/google\/jobs\/task_get\/advanced)\/([0-9a-f-]{36})$/;
const LIVE: Record<string, (data: Obj) => Obj[]> = {
  '/business_data/google/my_business_info/live': (d) => gbpResult(typeof d.keyword === 'string' ? d.keyword : ''),
  '/serp/google/maps/live/advanced': mapsResult,
  '/serp/google/ads_search/live/advanced': adsSearchResult,
  '/serp/google/ads_advertisers/live/advanced': advertisersResult,
};

async function readJson(init: RequestInit | undefined, input: string | URL | Request): Promise<unknown> {
  try {
    if (init?.body !== undefined && init.body !== null) return JSON.parse(typeof init.body === 'string' ? init.body : Buffer.from(init.body as ArrayBuffer).toString('utf8'));
    if (input instanceof Request) return await input.json();
  } catch { /* not JSON */ }
  return null;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });
}

/**
 * The fixture vendor fetch (one per process: posted DataForSEO tasks live in memory until fetched). `latencyMs` is
 * waited before each known answer (default 150–750 ms, roughly a live call); an unknown URL answers 599 at once.
 */
export function createFixtureFetch(opts: { latencyMs?: () => number } = {}): typeof fetch {
  const latency = opts.latencyMs ?? (() => 150 + Math.random() * 600);
  const tasks = new Map<string, Task>();

  async function route(url: URL, method: string, body: unknown): Promise<Reply | null> {
    if (DFS_HOSTS.has(url.hostname) && url.pathname.startsWith('/v3/')) {
      const path = url.pathname.slice('/v3'.length);
      const posted = Array.isArray(body) ? (body.filter((x) => x && typeof x === 'object') as Obj[]) : [];
      if (method === 'POST' && POST_PATHS[path]) {
        const kind = POST_PATHS[path]!;
        return json(dfsEnvelope(posted.map((data) => {
          const id = randomUUID();
          tasks.set(id, { kind, data, ready: true });
          return dfsTask(path, data, null, { id, code: 20100, message: 'Task Created.' });
        })));
      }
      if (method === 'GET' && READY_PATHS[path]) {
        const kind = READY_PATHS[path]!;
        const ready = [...tasks].filter(([, t]) => t.kind === kind && t.ready).map(([id, t]) => ({ id, se: 'google', date_posted: FIXED_TS[0], tag: t.data.tag ?? '', endpoint: null }));
        return json(dfsEnvelope([dfsTask(path, {}, ready)]));
      }
      const get = method === 'GET' ? GET_PATH.exec(path) : null;
      if (get) {
        const id = get[2]!;
        const t = tasks.get(id);
        if (!t) return json(dfsEnvelope([dfsTask(path, {}, null, { id, code: 40400, message: 'Not Found.' })]));
        t.ready = false;
        return json(dfsEnvelope([dfsTask(path, t.data, t.kind === 'reviews' ? reviewsResult(t.data) : jobsResult(t.data), { id })]));
      }
      const live = method === 'POST' ? LIVE[path] : undefined;
      if (live) return json(dfsEnvelope(posted.map((data) => dfsTask(path, data, live(data)))));
      return null;
    }
    if (url.hostname === 'api.scrapecreators.com' && method === 'GET') {
      if (url.pathname === '/v1/facebook/adLibrary/company/ads') {
        const pageId = url.searchParams.get('pageId') ?? '';
        return json({ success: true, credits_charged: 0, credits_remaining: 0, searchResultsCount: 2, cursor: '', results: metaAds(pageId, metaPageName(pageId)) });
      }
      if (url.pathname === '/v1/facebook/adLibrary/search/ads') {
        const name = url.searchParams.get('query') ?? '';
        return json({ success: true, credits_charged: 0, credits_remaining: 0, searchResultsCount: 2, cursor: '', searchResults: metaAds(metaPageIdFor(name), name) });
      }
      return null;
    }
    if (url.hostname === 'api.apify.com' && method === 'POST' && /^\/v2\/actors\/[^/]+\/run-sync-get-dataset-items$/.test(url.pathname)) {
      const target = (body as { urls?: { url?: unknown }[] } | null)?.urls?.[0]?.url;
      if (typeof target !== 'string') return null;
      const lib = new URL(target).searchParams;
      const pageId = lib.get('view_all_page_id');
      if (pageId) return json(metaAds(pageId, metaPageName(pageId)), 201);
      const q = lib.get('q');
      if (q) return json(metaAds(metaPageIdFor(q), q), 201);
      return null;
    }
    if (url.hostname === 'tiles.stadiamaps.com' && method === 'GET' && url.pathname.startsWith('/static_cacheable/')) {
      return { status: 200, body: PNG_1X1, headers: { 'content-type': 'image/png' } };
    }
    return null;
  }

  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const reply = await route(url, method, await readJson(init, input));
    if (!reply) return new Response(`fixture vendor: no fixture for ${method} ${url.origin}${url.pathname}`, { status: 599 });
    await sleep(latency(), init?.signal);
    if (Buffer.isBuffer(reply.body)) return new Response(new Uint8Array(reply.body), { status: reply.status, headers: reply.headers });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json', ...reply.headers } });
  }) as typeof fetch;
}

/** Fixture mode: the clients' own cost estimates (Stadia per image, Meta search per call) are ledgered at $0 too. */
export function zeroFixtureVendorCosts(ledger: LedgerSink): LedgerSink {
  return {
    recordLlmCall: (r) => ledger.recordLlmCall(r),
    recordVendorCall: (r) => ledger.recordVendorCall(FIXTURE_VENDORS.includes(r.vendor) ? { ...r, costUsd: 0 } : r),
  };
}
