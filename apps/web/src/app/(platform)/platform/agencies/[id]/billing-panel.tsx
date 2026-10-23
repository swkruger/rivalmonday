import { formatMoney, formatDate } from '@/lib/format';
import type { BillingState } from '@cs/db';
import { BillingStatePill } from '../../_components/billing-state-pill';
import { Field, fieldCls, MiniForm } from '../../_components/mini-form';
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
export function BillingPanel({ billing: b, role, codes }: { billing: AgencyBilling; role: PanelRole; codes: { id: string; code: string }[] }) {
  const staff = role === 'owner' || role === 'staff';
  const hidden = <input type="hidden" name="agencyId" value={b.agencyId} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <BillingStatePill state={b.state} />
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
        <div className="flex flex-col gap-3 border-t border-[#EEF2F6] pt-4">
          {b.state === 'pilot' ? (
            <MiniForm action={endPilotAction} submit="End pilot" variant="outline">{hidden}</MiniForm>
          ) : (
            <MiniForm action={grantPilotAction} submit="Grant pilot" variant="outline">
              {hidden}
              <Field label="Pilot ends (optional)" htmlFor="gp-end"><input id="gp-end" name="endsAt" type="date" className={fieldCls} /></Field>
            </MiniForm>
          )}
          {b.state === 'trialing' && (
            <MiniForm action={extendTrialAction} submit="Extend trial" variant="outline">
              {hidden}
              <Field label="New trial end" htmlFor="et-until"><input id="et-until" name="until" type="date" required className={fieldCls} /></Field>
            </MiniForm>
          )}
          <MiniForm action={attachDiscountAction} submit="Attach discount" variant="outline">
            {hidden}
            <Field label="Discount code" htmlFor="ad-code">
              <select id="ad-code" name="discountCodeId" defaultValue="" className={fieldCls}>
                <option value="">Choose…</option>
                {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </Field>
          </MiniForm>
          {role === 'owner' && (
            <MiniForm action={setSeatCapExemptAction} submit={b.seatCapExempt ? 'Restore pilot client cap' : 'Lift pilot client cap'} variant="outline">
              {hidden}
              <input type="hidden" name="exempt" value={b.seatCapExempt ? 'false' : 'true'} />
            </MiniForm>
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
                <span className="text-muted-foreground">{i.status ?? ''} · {i.created.slice(0, 10)}</span>
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
                {e.createdAt.slice(0, 10)} · {e.fromState ?? 'none'} → {e.toState} · {e.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
