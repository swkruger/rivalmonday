import { Button, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { WriteGuard } from '@/components/read-only';

type StepState = 'done' | 'skipped' | 'open';
export interface ChecklistStatus {
  steps: Record<'profile' | 'team' | 'plan' | 'branding' | 'first_client', StepState>;
  dismissed: boolean;
  completed: boolean;
}

const ITEMS = [
  { key: 'profile', label: 'Complete your agency profile', href: '/onboarding?step=profile' },
  { key: 'team', label: 'Invite your team', href: '/onboarding?step=team' },
  { key: 'plan', label: 'Review your plan', href: '/onboarding?step=plan' },
  { key: 'branding', label: 'Add your logo and colours', href: '/onboarding?step=branding' },
  { key: 'first_client', label: 'Add your first client', href: '/agency/clients/new' },
] as const;

/**
 * Phase 10 f6: the getting-started card on `/agency`. The page renders it for agency admins only; it hides itself once
 * the onboarding is completed or dismissed. `trialing` adds the "Add a payment method" sub-line under the plan item.
 */
export function OnboardingChecklist({ status, trialing, dismissAction }: { status: ChecklistStatus; trialing: boolean; dismissAction: () => Promise<void> }) {
  if (status.completed || status.dismissed) return null;
  const done = ITEMS.filter((i) => status.steps[i.key] === 'done').length;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Getting started</CardTitle>
          <p className="mt-1 text-sm text-muted-ink">{done} of {ITEMS.length} done</p>
        </div>
        <WriteGuard>
          <form action={dismissAction}>
            <Button type="submit" variant="ghost" size="sm">Dismiss</Button>
          </form>
        </WriteGuard>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-line">
          {ITEMS.map((item) => {
            const state = status.steps[item.key];
            return (
              <li key={item.key} data-testid={`step-${item.key}`} data-state={state} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className={state === 'done' ? 'mt-0.5 text-secondary' : 'mt-0.5 text-muted-ink'}>{state === 'done' ? '✓' : '○'}</span>
                <div className="min-w-0">
                  {state === 'done' ? (
                    <span className="text-muted-ink line-through">{item.label}</span>
                  ) : (
                    <Link href={item.href} className="font-semibold text-primary-soft-text">{item.label}</Link>
                  )}
                  {state === 'skipped' && <span className="ml-2 text-sm text-muted-ink">skipped</span>}
                  {item.key === 'plan' && trialing && (
                    <div className="text-sm">
                      <Link href="/onboarding?step=plan" className="text-primary-soft-text">Add a payment method</Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
