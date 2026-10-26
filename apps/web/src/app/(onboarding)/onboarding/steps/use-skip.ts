'use client';
import { useTransition } from 'react';
import { skipStepAction } from '../actions';

/** "Skip for now": posts the step to `skipStepAction` (which marks it skipped and redirects to the next screen). */
export function useSkip(step: 'team' | 'branding'): { skip: () => void; skipping: boolean } {
  const [skipping, start] = useTransition();
  return {
    skipping,
    skip: () => start(async () => {
      const fd = new FormData();
      fd.set('step', step);
      await skipStepAction(fd);
    }),
  };
}
