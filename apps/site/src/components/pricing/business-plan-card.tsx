'use client';

import { PLAN_CARDS } from '../../../content/pricing-page';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';
import { PlanCard } from './plan-card';

/** `/business/pricing`'s card: one typical price, and always the waitlist. */
export function BusinessPlanCard() {
  const { pilotMode } = usePilot();
  return (
    <PlanCard plan={pilotMode ? PLAN_CARDS.pilot.business : PLAN_CARDS.trial.business} slot="plan-business">
      <JoinButton start="business">Join the waitlist</JoinButton>
    </PlanCard>
  );
}
