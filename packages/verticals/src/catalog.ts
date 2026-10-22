import { z } from 'zod';
import { type VerticalPack, verticalPackSchema } from './schema';

/** Mirrors vertical_status_check / business_area_status_check in @cs/db (db depends on this package, so the array lives here). */
export const CATALOG_STATUSES = ['reviewed', 'unreviewed', 'merged'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export interface VerticalRow {
  id: string;
  name: string;
  status: CatalogStatus;
  mergedInto: string | null;
  version: number;
  gbpCategories: string[];
  gbpRelatedCategories: string[];
  config: Record<string, unknown>;
  draftEvidence: unknown | null;
  createdByAgencyId: string | null;
}

export interface BusinessAreaRow {
  verticalId: string;
  id: string;
  name: string;
  aliases: string[];
  status: CatalogStatus;
  mergedInto: string | null;
  evidence: unknown | null;
  createdByAgencyId: string | null;
}

export const GENERIC_VERTICAL_ID = 'generic';
const MAX_MERGE_DEPTH = 5;
const DEFAULT_TTL_MS = 60_000;
/** A miss on a snapshot at least this old reloads once (another process may have created/merged the id). */
const DEFAULT_MISS_REFRESH_MS = 1500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge recursively; arrays and scalars in `over` replace those in `base`. */
function deepMerge(base: Obj, over: Obj): Obj {
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

/** generic.config ⊕ row.config, then the columns (id/name/version, services from non-merged areas, GBP categories). */
export function assemblePack(row: VerticalRow, areas: BusinessAreaRow[], generic: VerticalRow): VerticalPack {
  const merged = deepMerge(generic.config, row.config);
  const services = areas
    .filter((a) => a.verticalId === row.id && a.status !== 'merged')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ id: a.id, name: a.name, aliases: a.aliases }));
  const discovery = { ...(isObj(merged.discovery) ? merged.discovery : {}), categories: row.gbpCategories, related_categories: row.gbpRelatedCategories };
  const result = verticalPackSchema.safeParse({ ...merged, id: row.id, name: row.name, version: row.version, services, discovery });
  if (!result.success) throw new Error(`Invalid vertical ${row.id}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Inverse of `assemblePack` for seeding: the config keeps everything that is not a column. */
export function splitPack(pack: VerticalPack): {
  row: Omit<VerticalRow, 'status' | 'mergedInto' | 'draftEvidence' | 'createdByAgencyId'>;
  areas: Pick<BusinessAreaRow, 'id' | 'name' | 'aliases'>[];
} {
  const { id, name, version, services, discovery, ...rest } = pack;
  const { categories, related_categories, ...discoveryRest } = discovery;
  return {
    row: { id, name, version, gbpCategories: categories, gbpRelatedCategories: related_categories, config: { ...rest, discovery: discoveryRest } },
    areas: services.map((s) => ({ id: s.id, name: s.name, aliases: s.aliases })),
  };
}

export interface VerticalSummary {
  id: string;
  name: string;
  status: CatalogStatus;
  services: { id: string; name: string }[];
}

export type PackLoader = (verticalId: string) => Promise<VerticalPack>;

export interface Catalog {
  packs: PackLoader;
  /** The generic pack (never selectable through `packs`); used for pack-vs-generic comparisons. Throws if the row is missing. */
  generic(): Promise<VerticalPack>;
  list(): Promise<VerticalSummary[]>;
  resolveId(id: string): Promise<string | null>;
  invalidate(): void;
}

interface Snapshot {
  rows: Map<string, VerticalRow>;
  packs: Map<string, VerticalPack>;
  generic: VerticalPack;
  fetchedAt: number;
}

export function createCatalog(
  source: () => Promise<{ verticals: VerticalRow[]; areas: BusinessAreaRow[] }>,
  opts: { ttlMs?: number; now?: () => number; missRefreshMs?: number } = {},
): Catalog {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const missRefresh = opts.missRefreshMs ?? DEFAULT_MISS_REFRESH_MS;
  let snap: Snapshot | null = null;
  let inflight: Promise<Snapshot> | null = null;
  let generation = 0;
  const warned = new Set<string>();

  async function build(): Promise<Snapshot> {
    const { verticals, areas } = await source();
    const rows = new Map(verticals.map((v) => [v.id, v]));
    const generic = rows.get(GENERIC_VERTICAL_ID);
    if (!generic) throw new Error('Vertical catalogue has no generic row');
    const packs = new Map<string, VerticalPack>();
    const genericPack = assemblePack(generic, areas, generic);
    for (const row of verticals) {
      if (row.id === GENERIC_VERTICAL_ID || row.status === 'merged') continue;
      try {
        packs.set(row.id, assemblePack(row, areas, generic));
      } catch (err) {
        if (!warned.has(row.id)) {
          warned.add(row.id);
          console.warn(`[verticals] skipping invalid vertical "${row.id}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return { rows, packs, generic: genericPack, fetchedAt: now() };
  }

  async function load(): Promise<Snapshot> {
    if (snap && now() - snap.fetchedAt < ttl) return snap;
    if (!inflight) {
      const gen = generation;
      const p: Promise<Snapshot> = build().then(
        (s) => {
          if (gen === generation) snap = s;
          if (inflight === p) inflight = null;
          return s;
        },
        (err: unknown) => {
          if (inflight === p) inflight = null;
          throw err;
        },
      );
      inflight = p;
    }
    return inflight;
  }

  function resolve(s: Snapshot, id: string): string | null {
    let cur = id;
    for (let hop = 0; hop <= MAX_MERGE_DEPTH; hop++) {
      if (cur === GENERIC_VERTICAL_ID) return null;
      const row = s.rows.get(cur);
      if (!row) return null;
      if (row.status !== 'merged') return s.packs.has(cur) ? cur : null;
      if (!row.mergedInto) return null;
      cur = row.mergedInto;
    }
    return null;
  }

  /** Resolve with one refresh-on-miss: cross-process writes (create/merge) are invisible to this snapshot until the TTL. */
  async function resolveFresh(id: string): Promise<{ s: Snapshot; final: string | null }> {
    let s = await load();
    let final = resolve(s, id);
    if (final) return { s, final };
    if (snap === s && now() - s.fetchedAt < missRefresh) return { s, final };
    if (snap === s) snap = null; // else someone already replaced/invalidated it: just use the (shared) current load
    s = await load();
    final = resolve(s, id);
    return { s, final };
  }

  return {
    async packs(id) {
      const { s, final } = await resolveFresh(id);
      const pack = final ? s.packs.get(final) : undefined;
      if (!pack) throw new Error(`Unknown vertical: ${id}`);
      return pack;
    },
    async generic() {
      return (await load()).generic;
    },
    async list() {
      const s = await load();
      return [...s.packs.values()]
        .map((p) => ({ id: p.id, name: p.name, status: s.rows.get(p.id)!.status, services: p.services.map((x) => ({ id: x.id, name: x.name })) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async resolveId(id) {
      return (await resolveFresh(id)).final;
    },
    invalidate() {
      generation++;
      snap = null;
      inflight = null;
    },
  };
}
