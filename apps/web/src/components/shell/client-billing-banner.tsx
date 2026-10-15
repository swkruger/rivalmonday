import Link from 'next/link';

export const PAYMENT_NEEDED_COPY = 'Payment needed — please update your payment method.';
export const pausedCopy = (agencyName: string) => `Monitoring is paused. Please contact ${agencyName}.`;

/**
 * Phase 9b spec § UI: the client workspace's billing banners (copy is binding; no platform name, agency name only).
 * Paused shows for every client role and wins over payment needed. Payment needed shows for the client owner only, with
 * a link to their billing page; a viewer sees nothing billing-related (f7). Agency roles get the agency-side pill instead.
 */
export function ClientBillingBanner({ role, clientId, agencyName, paused, paymentNeeded }: { role: string; clientId: string; agencyName: string; paused: boolean; paymentNeeded: boolean }) {
  if (role !== 'client_owner' && role !== 'client_viewer') return null;
  if (paused) return <Bar>{pausedCopy(agencyName)}</Bar>;
  if (paymentNeeded && role === 'client_owner') return <Bar href={`/c/${clientId}/settings/billing`}>{PAYMENT_NEEDED_COPY}</Bar>;
  return null;
}

function Bar({ href, children }: { href?: string; children: string }) {
  return (
    <div role="region" aria-label="Billing" data-tone="danger" className="flex flex-wrap items-center gap-3 bg-destructive px-4 py-2 text-sm font-semibold text-white lg:px-7">
      <span>{children}</span>
      {href && (
        <Link href={href} className="rounded-md bg-white px-3 py-1 text-xs font-bold text-ink hover:opacity-90">
          Update payment method
        </Link>
      )}
    </div>
  );
}
