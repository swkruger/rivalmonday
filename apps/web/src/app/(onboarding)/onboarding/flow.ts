/** The agency wizard (16 §5): three form steps and the confirmation screen. `plan` left the wizard (P2); `done` has no DB column. */
export const STEPS = ['profile', 'team', 'branding', 'done'] as const;
export type WizardStep = (typeof STEPS)[number];
/** The steps that are stored in `agency_onboarding` (done / skipped / open). */
export type SettledStep = Exclude<WizardStep, 'done'>;
export type StepStates = Record<SettledStep, 'done' | 'skipped' | 'open'>;

export const isStep = (v: unknown): v is WizardStep => (STEPS as readonly string[]).includes(v as string);
/** Only these can be skipped: the about step is required, the last screen is a confirmation. */
export const SKIPPABLE = ['team', 'branding'] as const;
export const isSkippable = (v: unknown): v is (typeof SKIPPABLE)[number] => (SKIPPABLE as readonly string[]).includes(v as string);

export const STEP_LABELS: Record<WizardStep, string> = {
  profile: 'About your agency',
  team: 'Your team',
  branding: 'Make it yours',
  done: "You're all set",
};

export const stepPath = (step: WizardStep): string => `/onboarding?step=${step}`;

/** Where "Continue" / "Skip for now" go; the last screen leaves the wizard. */
export function nextPath(step: WizardStep): string {
  const next = STEPS[STEPS.indexOf(step) + 1];
  return next ? stepPath(next) : '/agency';
}

export function prevPath(step: WizardStep): string | null {
  const prev = STEPS[STEPS.indexOf(step) - 1];
  return prev ? stepPath(prev) : null;
}

/** Resume point: the first step nobody has settled, else the confirmation screen. */
export function firstOpenStep(steps: StepStates): WizardStep {
  return (['profile', 'team', 'branding'] as const).find((s) => steps[s] === 'open') ?? 'done';
}
