export const STEPS = ['profile', 'team', 'plan', 'branding'] as const;
export type WizardStep = (typeof STEPS)[number];
export type StepStates = Record<WizardStep, 'done' | 'skipped' | 'open'>;

export const isStep = (v: unknown): v is WizardStep => (STEPS as readonly string[]).includes(v as string);

export const STEP_TITLES: Record<WizardStep, string> = {
  profile: 'Your agency',
  team: 'Invite your team',
  plan: 'Your plan',
  branding: 'Make it yours',
};

/** Where "Save and continue" / "Skip for now" go; the last step leaves the wizard. */
export function nextPath(step: WizardStep): string {
  const next = STEPS[STEPS.indexOf(step) + 1];
  return next ? `/onboarding?step=${next}` : '/agency';
}

export function prevPath(step: WizardStep): string | null {
  const prev = STEPS[STEPS.indexOf(step) - 1];
  return prev ? `/onboarding?step=${prev}` : null;
}

export function firstOpenStep(steps: StepStates): WizardStep {
  return STEPS.find((s) => steps[s] === 'open') ?? 'branding';
}
