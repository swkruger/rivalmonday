import type { SetupState } from '@cs/tools';

/**
 * 16 §6: the client wizard's screens. `details` and `lookup` live on `/agency/clients/new` (no client row yet); the
 * rest on `/c/<id>/setup`. A plain module so the server page and the client wizard agree.
 */
export const STEPS = ['details', 'lookup', 'profile', 'competitors', 'invite', 'billing', 'done'] as const;
export type WizardStep = (typeof STEPS)[number];
/** The screens `/c/<id>/setup` can show. */
export type SetupScreen = Exclude<WizardStep, 'details' | 'lookup'>;

export const STEP_LABELS: Record<WizardStep, string> = {
  details: 'Client details',
  lookup: 'Find the business',
  profile: 'What they do and where',
  competitors: 'Competitors',
  invite: 'Invite the owner',
  billing: 'Billing',
  done: 'All set',
};

/**
 * The screens this viewer walks through: billing only for agency admins on an active client (`totalSteps` 6; a prospect's
 * setup has 5), and the confirmation screen last.
 */
export function wizardSteps(admin: boolean, totalSteps: SetupState['totalSteps']): WizardStep[] {
  return STEPS.filter((s) => s !== 'billing' || (admin && totalSteps === 6));
}

export const stepNumber = (step: WizardStep, steps: readonly WizardStep[]): number => steps.indexOf(step) + 1;

export const stepHref = (clientId: string, step: WizardStep): string => `/c/${clientId}/setup?step=${step}`;

type StateForSteps = Pick<SetupState, 'steps' | 'competitors'>;

/** A step is settled once done or skipped; "asked the owner to pick" is settled for staff (the invite step is next). */
const SETTLED = new Set(['done', 'skipped', 'waiting_owner']);

/** The first screen still open, else the confirmation screen. */
export function firstOpenStep(state: StateForSteps, steps: readonly WizardStep[]): SetupScreen {
  const open: Record<Exclude<SetupScreen, 'done'>, boolean> = {
    profile: state.steps.profile === 'todo',
    competitors: !SETTLED.has(state.competitors),
    invite: state.steps.invite === 'todo',
    billing: state.steps.billing === 'todo',
  };
  return (['profile', 'competitors', 'invite', 'billing'] as const).find((s) => steps.includes(s) && open[s]) ?? 'done';
}

/**
 * The screen to show: the requested one when it is a setup screen at or before the first open one (Back, and returning
 * to a step already done), else the first open one. A setup that is no longer open (finished or dismissed) refuses writes,
 * so it shows the confirmation screen.
 */
export function resolveStep(requested: string | undefined, state: StateForSteps & Pick<SetupState, 'open'>, steps: readonly WizardStep[]): SetupScreen {
  const first = firstOpenStep(state, steps);
  if (!state.open) return 'done';
  const want = steps.find((s): s is SetupScreen => s === requested && s !== 'details' && s !== 'lookup');
  return want && steps.indexOf(want) <= steps.indexOf(first) ? want : first;
}
