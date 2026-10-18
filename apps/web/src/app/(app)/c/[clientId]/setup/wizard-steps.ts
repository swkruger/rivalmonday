import type { ClientSetupView } from './types';

/** The setup wizard's steps — a plain module so the server page's "Step n of N" and the client wizard agree. */
export type StepKey = 'profile' | 'search' | 'competitors' | 'invite' | 'billing';
export const STEPS: { key: StepKey; label: string }[] = [
  { key: 'profile', label: 'Your business' },
  { key: 'search', label: 'Finding competitors' },
  { key: 'competitors', label: 'Pick competitors' },
  { key: 'invite', label: 'Invite the owner' },
  { key: 'billing', label: 'Billing' },
];

/** Client roles see only their own three steps; staff see 5 (clients) or 4 (prospects) — `totalSteps`. */
export const stepsFor = (agency: boolean, totalSteps: number) => STEPS.slice(0, agency ? totalSteps : 3);

/** The first step still open (to do, running, blocked), else the last. */
export function currentStep(steps: ClientSetupView['state']['steps'], list: typeof STEPS): StepKey {
  const open = (k: StepKey) => ['todo', 'running', 'blocked'].includes(steps[k] ?? 'done');
  return list.find((s) => open(s.key))?.key ?? list[list.length - 1]!.key;
}

/** 15a §2.7: the setup page's `PageHeader` step — the wizard's own numbering (its stepper pills). */
export function wizardStep(view: ClientSetupView, agency: boolean): { n: number; of: number } {
  const list = stepsFor(agency, view.state.totalSteps);
  const current = currentStep(view.state.steps, list);
  return { n: list.findIndex((s) => s.key === current) + 1, of: list.length };
}
