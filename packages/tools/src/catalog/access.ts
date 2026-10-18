import { catalogRows } from '@cs/db';
import { type Catalog, createCatalog, type PackLoader, type VerticalPack } from '@cs/verticals';
import type { ToolDeps } from '../deps';

const processCatalogs = new WeakMap<object, Catalog>();

/** The catalogue for these deps: `deps.catalog`, else one per service connection (60 s TTL), so callers never share rows across databases. */
export function catalogOf(deps: ToolDeps): Catalog {
  if (deps.catalog) return deps.catalog;
  let c = processCatalogs.get(deps.service);
  if (!c) {
    c = createCatalog(() => catalogRows(deps.service), { ttlMs: 60_000 });
    processCatalogs.set(deps.service, c);
  }
  return c;
}

export const packsOf = (deps: ToolDeps): PackLoader => deps.packs ?? catalogOf(deps).packs;

/** Every selectable (non-generic, non-merged) vertical pack. */
export async function catalogPacks(deps: ToolDeps): Promise<VerticalPack[]> {
  const ids = (await catalogOf(deps).list()).map((v) => v.id);
  const load = packsOf(deps);
  return Promise.all(ids.map((id) => load(id)));
}
