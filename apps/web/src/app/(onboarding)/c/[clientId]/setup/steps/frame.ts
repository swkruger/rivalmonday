import type { OnboardingBrand } from '@/components/onboarding/onboarding-shell';
import { STEP_LABELS, stepNumber, type WizardStep } from '../wizard-steps';

/** What every setup screen shares: the agency brand, the "Save and exit" menu, whether a page guide exists, and this viewer's list of screens. */
export interface StepFrame {
  brand: OnboardingBrand;
  exitSlot: React.ReactNode;
  guide: boolean;
  steps: WizardStep[];
}

/** The `step` prop of `OnboardingShell` for a screen: "Step 3 of 7 · What they do and where". */
export const stepOf = (frame: StepFrame, step: WizardStep) => ({ n: stepNumber(step, frame.steps), of: frame.steps.length, label: STEP_LABELS[step] });
