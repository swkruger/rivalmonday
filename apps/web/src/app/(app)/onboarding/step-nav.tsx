'use client';
import { Button } from '@cs/ui';
import Link from 'next/link';
import { WriteGuard } from '@/components/read-only';
import { skipStepAction } from './actions';
import { prevPath, type WizardStep } from './flow';

/** "Back" and "Skip for now" under a step's form (a separate form: forms can't nest). */
export function StepNav({ step }: { step: WizardStep }) {
  const back = prevPath(step);
  return (
    <div className="flex items-center gap-4">
      {back && (
        <Link href={back} className="text-sm font-semibold text-secondary underline">
          Back
        </Link>
      )}
      <WriteGuard>
        <form action={skipStepAction}>
          <input type="hidden" name="step" value={step} />
          <Button type="submit" variant="ghost">
            Skip for now
          </Button>
        </form>
      </WriteGuard>
    </div>
  );
}
