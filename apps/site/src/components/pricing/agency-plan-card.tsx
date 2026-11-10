'use client';

import { HERO } from '../../../content/home';
import { PLAN_CARDS } from '../../../content/pricing-page';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';
import { PlanCard } from './plan-card';

/** `/agencies/pricing`'s card. Pilot defaults on (matches the server render); the trial wording swaps in once `/api/site-status` says so. */
export function AgencyPlanCard() {
  const { pilotMode } = usePilot();
  return (
    <PlanCard plan={pilotMode ? PLAN_CARDS.pilot.agency : PLAN_CARDS.trial.agency} slot="plan-agency">
      <JoinButton start="agency">{HERO.primaryCta}</JoinButton>
    </PlanCard>
  );
}
