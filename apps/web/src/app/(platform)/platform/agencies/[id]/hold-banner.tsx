'use client';
import { Button, StatusChip, Tooltip, TooltipProvider } from '@cs/ui';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { AGENCY_LIFECYCLE } from '@/lib/labels';
import { ActionDialog, ResultLine } from './action-dialog';
import { retryHoldBillingAction } from './actions';

/**
 * Spec §4.5: the header's danger "On hold" chip. Its tooltip (operators only — this page is platform-only) carries the
 * staff reason, since and by; dates arrive formatted in the viewer's zone. The chip is focusable so the tooltip opens
 * from the keyboard, and its accessible name says the same.
 */
export function HoldChip({ reason, since, byName }: { reason: string; since: string; byName: string }) {
  const chip = AGENCY_LIFECYCLE.on_hold;
  const detail = `Since ${since} · by ${byName}`;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip content={<><span className="block">Reason: {reason}</span><span className="block">{detail}</span></>}>
        <span tabIndex={0} aria-label={`${chip.label}. Reason: ${reason}. ${detail}`} className="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        </span>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Spec §4.2: shown while the newest hold-billing attempt failed (`holdBillingIssue`), with a Retry that runs
 * `platform_retry_hold_billing` behind a confirm (staff+ only: `canRetry`; viewers see just the sentence). A retry that still fails keeps the banner and shows what is left.
 */
export function HoldBanner({ agencyId, issue, hold, canRetry }: { agencyId: string; issue: 'pause' | 'resume'; hold: { since: string; byName: string } | null; canRetry: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const label = issue === 'pause' ? 'Retry billing pause' : 'Retry billing resume';
  return (
    <div data-tone="warning" className="flex flex-col gap-2 rounded-sm bg-warning-surface px-4 py-3 text-13 text-ink shadow-[inset_3px_0_0_var(--warning)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="min-w-0 text-sm">
          {issue === 'pause' ? (
            <>
              {hold && <><span className="font-semibold">On hold since {hold.since}</span> by {hold.byName}. </>}
              Billing pause failed for some subscriptions. The hold still applies.
            </>
          ) : (
            'Billing resume failed for some subscriptions.'
          )}
        </p>
        </div>
        {canRetry && <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setMessage(null); setOpen(true); }}>{label}</Button>}
      </div>
      {error && <ErrorNote compact focusKey={error}>{error}</ErrorNote>}
      <ResultLine message={message} />
      {canRetry && (
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        fields={{ agencyId }}
        title={issue === 'pause' ? 'Retry the billing pause?' : 'Retry the billing resume?'}
        body={issue === 'pause'
          ? "Stripe is asked again to pause billing on the agency's plan and its clients' subscriptions."
          : "Stripe is asked again to resume billing on the agency's plan and its clients' subscriptions."}
        confirmLabel="Retry"
        action={async (prev, fd) => {
          const r = await retryHoldBillingAction(prev, fd);
          // The result belongs on the banner, not in the dialog: close either way.
          if (r.ok) setMessage(r.message ?? null);
          else setError(r.error);
          return { ok: true };
        }}
      />
      )}
    </div>
  );
}
