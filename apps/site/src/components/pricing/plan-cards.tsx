'use client';

import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { HERO } from '../../../content/home';
import { PLAN_CARDS, type PlanCopy } from '../../../content/pricing-page';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';

function PlanCard({ plan, slot }: { plan: PlanCopy; slot: string }) {
  return (
    <Card data-slot={slot} className="h-full">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <p className="mt-2 text-2xl font-semibold text-ink">{plan.price}</p>
        <p className="mt-1 text-sm text-ink-secondary">{plan.note}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6">
        <ul className="space-y-2 text-sm text-ink-secondary">
          {plan.points.map((p) => (
            <li key={p} className="flex gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div>
          {plan.cta === 'business' ? (
            <JoinButton start="business">Join the waitlist</JoinButton>
          ) : (
            <JoinButton>{HERO.primaryCta}</JoinButton>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Pilot defaults on (matches the server render); the trial variant swaps in once `/api/site-status` says so. */
export function PlanCards() {
  const { pilotMode } = usePilot();
  const cards = pilotMode ? PLAN_CARDS.pilot : PLAN_CARDS.trial;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <PlanCard plan={cards.agency} slot="plan-agency" />
      <PlanCard plan={cards.business} slot="plan-business" />
    </div>
  );
}
