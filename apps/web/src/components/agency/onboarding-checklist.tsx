import { Button, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { WriteGuard } from '@/components/read-only';

type StepState = 'done' | 'skipped' | 'open';
export interface ChecklistStatus {
  steps: Record<'profile' | 'team' | 'plan' | 'branding' | 'first_client', StepState>;
  dismissed: boolean;
  completed: boolean;
}

interface Item { key: 'first_client' | 'payment' | 'team' | 'branding'; label: string; href: string; skipped?: boolean }

/**
 * 16 P3: only what is still open. The first client until one exists; a payment method while on the trial; the team and
 * brand steps only when the wizard skipped them (the about step is required and the plan step left the wizard).
 */
function openItems(status: ChecklistStatus, trialing: boolean): Item[] {
  const items: Item[] = [];
  if (status.steps.first_client !== 'done') items.push({ key: 'first_client', label: 'Add your first client', href: '/agency/clients/new' });
  if (trialing) items.push({ key: 'payment', label: 'Add a payment method', href: '/agency/settings/billing' });
  if (status.steps.team === 'skipped') items.push({ key: 'team', label: 'Invite your team', href: '/onboarding?step=team', skipped: true });
  if (status.steps.branding === 'skipped') items.push({ key: 'branding', label: 'Add your logo and colours', href: '/onboarding?step=branding', skipped: true });
  return items;
}

/**
 * The getting-started card on `/agency` (the page renders it for agency admins only). It lists only what is open and
 * hides itself when the admin dismissed it or nothing is left. `trialing` adds the payment method item.
 */
export function OnboardingChecklist({ status, trialing, dismissAction }: { status: ChecklistStatus; trialing: boolean; dismissAction: () => Promise<void> }) {
  const items = openItems(status, trialing);
  if (status.dismissed || items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Getting started</CardTitle>
          <p className="mt-1 text-sm text-muted-ink">{items.length} left to do</p>
        </div>
        <WriteGuard>
          <form action={dismissAction}>
            <Button type="submit" variant="ghost" size="sm">Dismiss</Button>
          </form>
        </WriteGuard>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.key} data-testid={`step-${item.key}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span aria-hidden className="mt-0.5 text-muted-ink">○</span>
              <div className="min-w-0">
                <Link href={item.href} className="font-semibold text-primary-soft-text">{item.label}</Link>
                {item.skipped && <span className="ml-2 text-sm text-muted-ink">skipped</span>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
