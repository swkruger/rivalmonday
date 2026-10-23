'use client';
import { formatDate } from '@/lib/format';
import { Button, StatusChip } from '@cs/ui';
import { useActionState } from 'react';
import { FormError } from '@/components/form-error';
import { formatMoney } from '@/lib/format';
import { BILLING_STATE, labelFor } from '@/lib/labels';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { continuePlanAction, startCheckoutAction } from '../actions';
import { StepNav } from '../step-nav';

export interface PlanSummary {
  state: 'pilot' | 'trialing' | 'active' | 'past_due' | 'read_only' | 'suspended' | 'cancelled';
  plan?: { name: string; basePriceCents: number; includedSeats: number; seatPriceCents: number } | null;
  dates: { trialEndsAt: string | null; pilotEndsAt: string | null };
  reducedTrial: boolean;
  maxActiveClients: number;
  discount: { code?: string; couponId: string } | null;
}

function endLine(s: PlanSummary, now?: Date): string | null {
  if (s.state === 'pilot' && s.dates.pilotEndsAt) return `Pilot ends ${formatDate(s.dates.pilotEndsAt, { tz: 'UTC', ...(now && { now }) })}`;
  if (s.state === 'trialing' && s.dates.trialEndsAt) return `Trial ends ${formatDate(s.dates.trialEndsAt, { tz: 'UTC', ...(now && { now }) })}`;
  return null;
}

/** `now` (ISO instant) is read once on the server and passed down, so the year shown never differs between server and browser render. */
export function PlanStep({ summary, now }: { summary: PlanSummary; now?: string }) {
  const [state, checkout, pending] = useActionState(startCheckoutAction, { ok: true } as FormResult);
  const end = endLine(summary, now ? new Date(now) : undefined);
  const state_ = labelFor(BILLING_STATE, summary.state);
  const plan = summary.plan;
  const n = summary.maxActiveClients;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-md border border-line bg-surface p-6">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Plan state</dt><dd><StatusChip tone={state_.tone}>{state_.label}</StatusChip></dd></div>
          {plan && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="font-semibold">
                {formatMoney(plan.basePriceCents, { unit: 'cents' })} per month, includes {plan.includedSeats} {plan.includedSeats === 1 ? 'client' : 'clients'}; each extra client {formatMoney(plan.seatPriceCents, { unit: 'cents' })} per month.
              </dd>
            </div>
          )}
          {end && <div><dt className="text-muted-foreground">Ends</dt><dd className="font-semibold">{end}</dd></div>}
          <div><dt className="text-muted-foreground">Clients included</dt><dd className="font-semibold">Up to {n} {n === 1 ? 'client' : 'clients'}</dd></div>
          {summary.discount && <div><dt className="text-muted-foreground">Discount</dt><dd className="font-semibold">{summary.discount.code ? `Code ${summary.discount.code} applied` : 'Applied'}</dd></div>}
        </dl>
        {summary.reducedTrial && (
          <p className="rounded-lg bg-muted-surface p-3 text-ink">During your trial you can monitor 1 client, refreshed weekly. Add a payment method to monitor up to 3, refreshed daily.</p>
        )}
        <FormError state={state} />
        {/* Already paying: nothing to add. */}
        {summary.state !== 'active' && (
          <WriteGuard>
            <form action={checkout}>
              <Button type="submit" variant="outline" disabled={pending}>
                Add payment method
              </Button>
            </form>
          </WriteGuard>
        )}
        <WriteGuard>
          <form action={continuePlanAction}>
            <Button type="submit">Save and continue</Button>
          </form>
        </WriteGuard>
      </div>
      <StepNav step="plan" />
    </div>
  );
}
