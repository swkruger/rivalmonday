'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { FormError } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { formatLongDate } from '@/components/billing/format';
import type { FormResult } from '@/server/forms';
import { continuePlanAction, startCheckoutAction } from '../actions';
import { StepNav } from '../step-nav';

export interface PlanSummary {
  state: 'pilot' | 'trialing' | 'active' | 'past_due' | 'read_only' | 'suspended' | 'cancelled';
  dates: { trialEndsAt: string | null; pilotEndsAt: string | null };
  reducedTrial: boolean;
  maxActiveClients: number;
  discount: { code?: string; couponId: string } | null;
}

const STATE_LABEL: Record<PlanSummary['state'], string> = {
  pilot: 'Pilot', trialing: 'Free trial', active: 'Active', past_due: 'Payment overdue', read_only: 'Paused', suspended: 'Suspended', cancelled: 'Cancelled',
};

function endLine(s: PlanSummary): string | null {
  if (s.state === 'pilot' && s.dates.pilotEndsAt) return `Pilot ends ${formatLongDate(s.dates.pilotEndsAt)}`;
  if (s.state === 'trialing' && s.dates.trialEndsAt) return `Trial ends ${formatLongDate(s.dates.trialEndsAt)}`;
  return null;
}

export function PlanStep({ summary }: { summary: PlanSummary }) {
  const [state, checkout, pending] = useActionState(startCheckoutAction, { ok: true } as FormResult);
  const end = endLine(summary);
  const n = summary.maxActiveClients;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Plan state</dt><dd className="font-semibold">{STATE_LABEL[summary.state]}</dd></div>
          {end && <div><dt className="text-muted-foreground">Ends</dt><dd className="font-semibold">{end}</dd></div>}
          <div><dt className="text-muted-foreground">Clients included</dt><dd className="font-semibold">Up to {n} {n === 1 ? 'client' : 'clients'}</dd></div>
          {summary.discount && <div><dt className="text-muted-foreground">Discount</dt><dd className="font-semibold">{summary.discount.code ? `Code ${summary.discount.code} applied` : 'Applied'}</dd></div>}
        </dl>
        {summary.reducedTrial && (
          <p className="rounded-lg bg-muted-surface p-3 text-ink">During your trial you can monitor 1 client, refreshed weekly. Add a payment method to monitor up to 3, refreshed daily.</p>
        )}
        <FormError state={state} />
        <WriteGuard>
          <form action={checkout}>
            <Button type="submit" variant="outline" disabled={pending}>
              Add payment method
            </Button>
          </form>
        </WriteGuard>
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
