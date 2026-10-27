import type { SetupState } from '@cs/tools';
import type { ClientSetupView } from './types';

/**
 * The interim (11a) wizard's own five steps — a plain module so the server page's "Step n of N" and the client wizard
 * agree. Phase 16 Task 8 rebuilds setup on the new step model; until then `legacySteps` maps the new state onto these.
 */
export type StepKey = 'profile' | 'search' | 'competitors' | 'invite' | 'billing';
export type LegacyStepStatus = 'todo' | 'running' | 'done' | 'skipped' | 'blocked';
export type LegacySteps = { profile: LegacyStepStatus; search: LegacyStepStatus; competitors: LegacyStepStatus; invite?: LegacyStepStatus; billing?: LegacyStepStatus };
export const STEPS: { key: StepKey; label: string }[] = [
  { key: 'profile', label: 'Your business' },
  { key: 'search', label: 'Finding competitors' },
  { key: 'competitors', label: 'Pick competitors' },
  { key: 'invite', label: 'Invite the owner' },
  { key: 'billing', label: 'Billing' },
];

/**
 * The new state (merged search + pick step) as the interim wizard's five steps. `waiting_owner` is settled for staff
 * (they move on to the invite step) and the pick screen for the owner who was asked to pick.
 */
export function legacySteps(state: Pick<SetupState, 'steps' | 'competitors'>, agency: boolean): LegacySteps {
  const c = state.competitors;
  const search: LegacyStepStatus = c === 'searching' ? 'running' : c === 'blocked' ? 'blocked' : c === 'todo' ? 'todo' : 'done';
  const competitors: LegacyStepStatus = c === 'done' || c === 'skipped' ? c : c === 'waiting_owner' && agency ? 'done' : 'todo';
  const { profile, invite, billing } = state.steps;
  return { profile, search, competitors, invite, ...(billing ? { billing } : {}) };
}

/** The interim wizard's step count: the new list (6, 5 for prospects) less details + lookup, plus the separate search step. */
export const legacyTotal = (state: Pick<SetupState, 'totalSteps'>) => state.totalSteps - 1;

/** Client roles see only their own three steps; staff see 5 (clients) or 4 (prospects) — `legacyTotal`. */
export const stepsFor = (agency: boolean, totalSteps: number) => STEPS.slice(0, agency ? totalSteps : 3);

/** The first step still open (to do, running, blocked), else the last. */
export function currentStep(steps: LegacySteps, list: typeof STEPS): StepKey {
  const open = (k: StepKey) => ['todo', 'running', 'blocked'].includes(steps[k] ?? 'done');
  return list.find((s) => open(s.key))?.key ?? list[list.length - 1]!.key;
}

/** 15a §2.7: the setup page's `PageHeader` step — the wizard's own numbering (its stepper pills). */
export function wizardStep(view: ClientSetupView, agency: boolean): { n: number; of: number } {
  const list = stepsFor(agency, legacyTotal(view.state));
  const current = currentStep(legacySteps(view.state, agency), list);
  return { n: list.findIndex((s) => s.key === current) + 1, of: list.length };
}
