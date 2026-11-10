import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import type { PlanCopy } from '../../../content/pricing-page';

/** One plan card (spec § 6): title with the pilot chip beside it, price + "/mo", note, tier rows, points, then the button. */
export function PlanCard({ plan, slot, children }: { plan: PlanCopy; slot: 'plan-agency' | 'plan-business'; children: React.ReactNode }) {
  return (
    <Card data-slot={slot} className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CardTitle>{plan.name}</CardTitle>
          {plan.chip ? (
            <span data-slot="plan-chip" className="rounded-full bg-chip-info-bg px-2 py-0.5 text-xs font-semibold text-chip-info-text">
              {plan.chip}
            </span>
          ) : null}
        </div>
        <p className="mt-3 flex items-baseline gap-1">
          <span className="text-price font-semibold text-ink">{plan.price}</span>
          <span className="text-base text-ink-secondary">/mo</span>
        </p>
        <p className="mt-1 text-sm text-ink-secondary">{plan.note}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6">
        <div className="space-y-5">
          {plan.rows ? (
            <dl className="divide-y divide-line border-y border-line text-sm">
              {plan.rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-secondary">{r.label}</dt>
                  <dd className="font-medium text-ink">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ul className="space-y-2 text-sm text-ink-secondary">
            {plan.points.map((p) => (
              <li key={p} className="flex gap-2">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>{children}</div>
      </CardContent>
    </Card>
  );
}
