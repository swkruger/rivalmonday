import type { BillingState } from '@cs/db';
import { StatusChip } from '@cs/ui';
import { ConfirmForm } from '@/components/confirm-form';
import { formatDate, formatMoney } from '@/lib/format';
import { BILLING_STATE, billingReasonLabel, INVOICE_STATUS, labelFor } from '@/lib/labels';
import { Field, fieldCls } from '../../_components/mini-form';
import { attachDiscountAction, endPilotAction, extendTrialAction, grantPilotAction, setSeatCapExemptAction } from './billing-actions';

export interface AgencyBilling {
  agencyId: string;
  state: BillingState;
  plan: { name: string; version: number } | null;
  trialEndsAt: string | null;
  pilotEndsAt: string | null;
  pastDueSince: string | null;
  cancelAt: string | null;
  seatsSynced: number | null;
  seatSyncPending: boolean;
  seatCapExempt: boolean;
  attachedCouponId: string | null;
  invoices: { id: string; number: string | null; amountPaidCents: number; status: string | null; hostedInvoiceUrl: string | null; created: string }[];
  events: { fromState: string | null; toState: string; reason: string; actor: string; createdAt: string }[];
}

export type PanelRole = 'owner' | 'staff' | 'viewer';

const dateOr = (iso: string | null) => (iso ? formatDate(iso, { tz: 'UTC' }) : '—');

/** Billing panel on the agency detail page. Controls the role cannot use are not rendered (the tools enforce as well). */
export function BillingPanel({ billing: b, role, codes, tz }: { billing: AgencyBilling; role: PanelRole; codes: { id: string; code: string }[]; tz: string }) {
  const dateOr = (iso: string | null) => (iso ? formatDate(iso, { tz }) : '—');
  const state = labelFor(BILLING_STATE, b.state);
  const staff = role === 'owner' || role === 'staff';
  const hidden = <input type="hidden" name="agencyId" value={b.agencyId} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
        <span className="font-semibold">{b.plan ? `${b.plan.name} v${b.plan.version}` : 'No plan'}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Trial ends</dt><dd>{dateOr(b.trialEndsAt)}</dd></div>
        <div><dt className="text-muted-foreground">Pilot ends</dt><dd>{dateOr(b.pilotEndsAt)}</dd></div>
        <div>
          <dt className="text-muted-foreground">Seats</dt>
          <dd>{b.seatsSynced === null ? '—' : `${b.seatsSynced} synced`}{b.seatSyncPending ? ' (sync pending)' : ''}</dd>
        </div>
        <div><dt className="text-muted-foreground">Pilot client cap</dt><dd>{b.seatCapExempt ? 'Exempt' : 'Standard cap'}</dd></div>
        <div><dt className="text-muted-foreground">Attached coupon</dt><dd>{b.attachedCouponId ?? '—'}</dd></div>
      </dl>
      {staff && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {b.state === 'pilot' ? (
            <ConfirmForm
              action={endPilotAction}
              submit="End pilot"
              variant="outline"
              title="End this pilot?"
              body="The pilot ends now and the free trial starts."
              confirmLabel="End pilot"
            >{hidden}</ConfirmForm>
          ) : (
            <ConfirmForm
              action={grantPilotAction}
              submit="Grant pilot"
              variant="outline"
              title="Grant a pilot?"
              body="The agency moves to a pilot with no card needed, until the end date if you set one."
              confirmLabel="Grant pilot"
            >
              {hidden}
              <Field label="Pilot ends (optional)" htmlFor="gp-end"><input id="gp-end" name="endsAt" type="date" className={fieldCls} /></Field>
            </ConfirmForm>
          )}
          {b.state === 'trialing' && (
            <ConfirmForm
              action={extendTrialAction}
              submit="Extend trial"
              variant="outline"
              title="Extend the free trial?"
              body="The trial runs until the date you chose."
              confirmLabel="Extend trial"
            >
              {hidden}
              <Field label="New trial end" htmlFor="et-until"><input id="et-until" name="until" type="date" required className={fieldCls} /></Field>
            </ConfirmForm>
          )}
          <ConfirmForm
            action={attachDiscountAction}
            submit="Attach discount"
            variant="outline"
            title="Attach this discount?"
            body="The discount applies to this agency's subscription, or at checkout if it has none yet."
            confirmLabel="Attach discount"
          >
            {hidden}
            <Field label="Discount code" htmlFor="ad-code">
              <select id="ad-code" name="discountCodeId" defaultValue="" className={fieldCls}>
                <option value="">Choose…</option>
                {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </Field>
          </ConfirmForm>
          {role === 'owner' && (
            <ConfirmForm
              action={setSeatCapExemptAction}
              submit={b.seatCapExempt ? 'Restore pilot client cap' : 'Lift pilot client cap'}
              variant="outline"
              title={b.seatCapExempt ? 'Restore the pilot client cap?' : 'Lift the pilot client cap?'}
              body={b.seatCapExempt ? 'The agency goes back to the standard client cap while it is in pilot.' : 'The agency can add more clients than the standard cap while it is in pilot.'}
              confirmLabel={b.seatCapExempt ? 'Restore cap' : 'Lift cap'}
            >
              {hidden}
              <input type="hidden" name="exempt" value={b.seatCapExempt ? 'false' : 'true'} />
            </ConfirmForm>
          )}
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground">Recent invoices</h3>
        {b.invoices.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="mt-1 text-sm">
            {b.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-x-3 py-0.5">
                {i.hostedInvoiceUrl ? (
                  <a href={i.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline">{i.number ?? i.id}</a>
                ) : (
                  <span>{i.number ?? i.id}</span>
                )}
                <span>{formatMoney(i.amountPaidCents, { unit: 'cents' })}</span>
                {i.status && <StatusChip tone={labelFor(INVOICE_STATUS, i.status).tone}>{labelFor(INVOICE_STATUS, i.status).label}</StatusChip>}
                <span className="text-muted-foreground">{formatDate(i.created, { tz })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground">Last events</h3>
        {b.events.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No billing events yet.</p>
        ) : (
          <ul className="mt-1 text-sm">
            {b.events.slice(0, 5).map((e) => (
              <li key={`${e.createdAt}-${e.toState}-${e.reason}`} className="py-0.5">
                <span className="text-muted-foreground">{formatDate(e.createdAt, { tz })}</span>{' · '}
                {e.fromState ? (
                  <>
                    <StatusChip tone={labelFor(BILLING_STATE, e.fromState).tone}>{labelFor(BILLING_STATE, e.fromState).label}</StatusChip> <span aria-label="to">→</span>{' '}
                  </>
                ) : (
                  'Started as '
                )}
                <StatusChip tone={labelFor(BILLING_STATE, e.toState).tone}>{labelFor(BILLING_STATE, e.toState).label}</StatusChip>{' · '}{billingReasonLabel(e.reason)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
