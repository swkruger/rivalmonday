import { createDecisionRunner } from '../decisions';

/** Change tagging (`tag_decisions`): accuracy/ECE per question family and role. Report-only. */
export const changesRunner = createDecisionRunner('changes');
