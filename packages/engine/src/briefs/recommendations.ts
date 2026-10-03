import type { briefItem, recommendation } from '@cs/db';

/** Spec §8.5: each approved brief item's recommended action becomes a tracked recommendation. */
export function recommendationFromItem(item: typeof briefItem.$inferSelect): typeof recommendation.$inferInsert {
  return {
    // The action is what the owner tracks; the verified fact behind it is the rationale.
    agencyId: item.agencyId, clientId: item.clientId, title: item.recommendedAction.slice(0, 200) || item.headline, rationale: item.whatChanged,
    evidenceIds: item.evidenceIds, eventIds: item.eventIds, moveId: item.moveId, briefItemId: item.id, playbookId: item.playbookId,
    effort: item.effort, impact: item.impact, owner: 'client', status: 'todo', source: 'brief', upsellTag: item.upsellTag,
  };
}
