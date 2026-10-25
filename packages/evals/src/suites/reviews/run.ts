import { createDecisionRunner } from '../decisions';

/** Review analysis (`review_decisions`): accuracy/ECE per family and role, topic P/R/F1, sentiment MAE. Report-only. */
export const reviewsRunner = createDecisionRunner('reviews');
