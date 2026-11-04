import json from '../../content/rival-grid.json';

/**
 * The homepage §2 rival map story (spec D13): the sample rival `r1`'s own map ranks for the sample keyword, one
 * 49-cell grid per sample week. Fictional sample data, generated once by `scripts/rival-rank-story.mjs`.
 */
export interface RivalGrid {
  rivalId: string;
  weeks: { weekOf: string; ranks: (number | null)[] }[];
}

export const RIVAL_GRID: RivalGrid = json;

/** The rival's ranks for one sample week (`[]` for a week outside the sample). */
export function rivalRanks(weekOf: string): (number | null)[] {
  return RIVAL_GRID.weeks.find((w) => w.weekOf === weekOf)?.ranks ?? [];
}
