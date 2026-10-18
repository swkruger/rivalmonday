import { FEATURES, ToolError, type AccessContext, type Role } from '@cs/core';
import { client, type ClientRow, clientSetup, withTenant, type Tx } from '@cs/db';
import { listVerticalPacks, type VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { type ClientInput, cleanClientInput, clientInputProblems } from '../client-input';
import { packsOf, type ToolDeps } from '../deps';
import { enqueueMapRefresh } from '../rank-scan';
import { startFirstAutoSearch, type SearchStart } from '../rival-search';
import type { ServiceAreaInput } from '../tools/schemas';

/**
 * Fix round 1 (#2): decide "unknown vertical" against the real pack catalog instead of
 * swallowing every loader error into invalid_input. A genuine loader failure (corrupt/missing
 * YAML for a vertical id that IS in the catalog) propagates uncaught and the registry reports
 * it as `internal`, not a user-fixable input error.
 */
export async function packFor(deps: ToolDeps, verticalId: string): Promise<VerticalPack> {
  if (!(await listVerticalPacks()).includes(verticalId)) throw new ToolError('invalid_input', `Unknown vertical: ${verticalId}`);
  return packsOf(deps)(verticalId);
}

/** Key-order-independent JSON (jsonb returns object keys in its own order). */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
}

export function validated(input: ClientInput, pack: VerticalPack): ClientInput {
  const clean = cleanClientInput(input);
  const problems = clientInputProblems(clean, pack);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  return clean;
}

export type ClientProfilePatch = {
  name?: string; services?: string[]; keywords?: string[]; serviceArea?: ServiceAreaInput | null; placeId?: string | null; features?: string[];
};

/**
 * The profile write shared by `update_client_profile` and the setup-wizard tools (Phase 11a). Callers guard access and
 * permissions — nothing is checked here beyond the tenant transaction's RLS. Read-modify-write in ONE transaction with
 * `FOR UPDATE` so concurrent partial updates cannot clobber each other. `search` is `startFirstAutoSearch`'s result
 * when this change completed the search inputs (so a refusal can be surfaced), else null. With `actor` and an existing
 * `client_setup` row, `last_changed_*` is stamped (service connection; app_user has SELECT only).
 * `recheck` runs inside the tenant tx right after the client row lock (a caller's closed-setup re-guard).
 */
export async function applyClientProfileChange(
  ctx: AccessContext, deps: ToolDeps, clientId: string, patch: ClientProfilePatch,
  actor?: { userId: string; role: Role }, recheck?: (tx: Tx) => Promise<void>,
): Promise<{ client: ClientRow; search: SearchStart | null }> {
  const { updated, placeChanged, searchInputsReady, mapChanged } = await withTenant(deps.app, ctx, async (tx) => {
    const [current] = await tx.select().from(client).where(eq(client.id, clientId)).for('update');
    if (!current) throw new ToolError('not_found', 'Client not found');
    if (recheck) await recheck(tx);
    const pack = await packFor(deps, current.verticalId);
    // `current.features` may hold unknown legacy strings; drop them here so an unknown value never survives a save.
    const currentFeatures = (current.features as string[]).filter((f) => (FEATURES as readonly string[]).includes(f));
    const merged = validated(
      {
        name: patch.name ?? current.name, services: patch.services ?? current.services, keywords: patch.keywords ?? current.keywords,
        serviceArea: patch.serviceArea === undefined ? current.serviceArea : patch.serviceArea, placeId: patch.placeId === undefined ? current.placeId : patch.placeId,
        features: (patch.features ?? currentFeatures) as ClientInput['features'],
      },
      pack,
    );
    const [updated] = await tx.update(client).set({ name: merged.name, services: merged.services, keywords: merged.keywords, serviceArea: merged.serviceArea, placeId: merged.placeId, features: merged.features }).where(eq(client.id, clientId)).returning();
    const searchInputsChanged = canonical(merged.keywords) !== canonical(current.keywords)
      || canonical(merged.serviceArea) !== canonical(current.serviceArea) || merged.placeId !== current.placeId;
    // 13b: the rank map background depends on the service area's centre and radius only.
    const mapChanged = !!merged.serviceArea && (merged.serviceArea.radiusKm !== current.serviceArea?.radiusKm
      || merged.serviceArea.center.lat !== current.serviceArea?.center.lat || merged.serviceArea.center.lng !== current.serviceArea?.center.lng);
    return { updated: updated!, mapChanged, placeChanged: merged.placeId !== current.placeId, searchInputsReady: searchInputsChanged && merged.keywords.length > 0 && !!merged.serviceArea && !!merged.placeId };
  });
  // Final review: the self business was found by the old place id. Unlink it so benchmarks stop using the wrong
  // business and its paid gbp/reviews sources stop being claimed (unless something else still needs them); the next
  // schedule tick re-links from the new place id (`ensureSelfCompetitors`). app_user cannot write this column
  // (migration 0026), so the service Db writes it, after the RLS-checked update above proved access.
  if (placeChanged) await deps.service.update(client).set({ selfCompetitorId: null }).where(eq(client.id, clientId));
  // No row (old clients, tests) → nothing to stamp.
  if (actor) await deps.service.update(clientSetup).set({ lastChangedBy: actor.userId, lastChangedRole: actor.role, lastChangedAt: new Date() }).where(eq(clientSetup.clientId, clientId));
  // 13b: refresh the rank map background after commit (failure logged, never thrown) — covers both callers
  // (`update_client_profile` and `save_setup_profile`).
  if (mapChanged) await enqueueMapRefresh(deps, clientId);
  // 12a D4 + owner decision 2026-10-15: after commit, the profile's first completion starts discovery once; a client
  // with any earlier run is never auto re-run by later edits.
  const search = searchInputsReady ? await startFirstAutoSearch(deps, clientId) : null;
  return { client: updated, search };
}
