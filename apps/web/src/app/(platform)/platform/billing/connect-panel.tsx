import { formatMoney } from '@/lib/format';
import { Field, fieldCls } from '../_components/mini-form';
import { ConfirmForm } from '@/components/confirm-form';
import { setConnectFeeAction } from './actions';

export interface ConnectAgencyRow {
  agencyId: string;
  name: string;
  status: 'pending' | 'connected' | 'restricted' | 'disconnected';
  chargesEnabled: boolean;
  feeOverridePercent: number | null;
  payingClients: number;
  paymentNeededClients: number;
  clientMrrCents: number;
}
export interface ConnectOverview {
  globalFeePercent: number;
  agencies: ConnectAgencyRow[];
  totals: { connectedAgencies: number; payingClients: number; clientMrrCents: number };
}

const STATUS: Record<ConnectAgencyRow['status'], string> = { pending: 'Pending', connected: 'Connected', restricted: 'Restricted', disconnected: 'Disconnected' };
const pct = (n: number) => `${n}%`;

/** Stripe Connect on the console: everyone sees the overview; owners also get the fee forms (the tools enforce as well). */
export function ConnectPanel({ overview: o, canEdit }: { overview: ConnectOverview; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Connected agencies</dt><dd className="text-xl font-semibold text-secondary">{o.totals.connectedAgencies}</dd></div>
        <div><dt className="text-muted-foreground">Paying clients</dt><dd className="text-xl font-semibold text-secondary">{o.totals.payingClients}</dd></div>
        <div><dt className="text-muted-foreground">Client MRR via Connect</dt><dd className="text-xl font-semibold text-secondary">{formatMoney(o.totals.clientMrrCents, { unit: 'cents' })}</dd></div>
        <div><dt className="text-muted-foreground">Default fee</dt><dd className="text-xl font-semibold text-secondary">{pct(o.globalFeePercent)}</dd></div>
      </dl>
      {o.agencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agency has connected Stripe yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground">
                {['Agency', 'Status', 'Charges', 'Fee override', 'Paying', 'Payment needed', 'Client MRR'].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {o.agencies.map((a) => (
                <tr key={a.agencyId} className="border-t border-[#EEF2F6]">
                  <td className="py-2 pr-3 font-semibold">{a.name}</td>
                  <td className="py-2 pr-3">{STATUS[a.status]}</td>
                  <td className="py-2 pr-3">{a.chargesEnabled ? 'Enabled' : 'Off'}</td>
                  <td className="py-2 pr-3">{a.feeOverridePercent === null ? 'Default' : pct(a.feeOverridePercent)}</td>
                  <td className="py-2 pr-3">{a.payingClients}</td>
                  <td className="py-2 pr-3">{a.paymentNeededClients}</td>
                  <td className="py-2 pr-3">{formatMoney(a.clientMrrCents, { unit: 'cents' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="flex flex-col gap-3 border-t border-[#EEF2F6] pt-4">
          <p className="text-sm text-muted-foreground">Fees apply to Checkout links created after the change; existing subscriptions keep their fee. 0 sends no fee.</p>
          <ConfirmForm
            action={setConnectFeeAction}
            submit="Save default fee"
            variant="outline"
            title="Change the default platform fee?"
            body="The new fee applies to Checkout links created from now on. Existing subscriptions keep their fee."
            confirmLabel="Save fee"
            fields={{ agencyId: '' }}
          >
            <Field label="Default fee (%)" htmlFor="cf-global"><input id="cf-global" name="percent" inputMode="decimal" required defaultValue={String(o.globalFeePercent)} className={fieldCls} /></Field>
          </ConfirmForm>
          {o.agencies.length > 0 && (
            <ConfirmForm
              action={setConnectFeeAction}
              submit="Save agency fee"
              variant="outline"
              title="Change this agency's platform fee?"
              body="A blank fee clears the override so the default applies. A new fee applies to Checkout links created from now on; existing subscriptions keep their fee."
              confirmLabel="Save fee"
            >
              <Field label="Agency" htmlFor="cf-agency">
                <select id="cf-agency" name="agencyId" required defaultValue="" className={fieldCls}>
                  <option value="" disabled>Choose…</option>
                  {o.agencies.map((a) => <option key={a.agencyId} value={a.agencyId}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Fee (%), blank for default" htmlFor="cf-pct"><input id="cf-pct" name="percent" inputMode="decimal" className={fieldCls} /></Field>
            </ConfirmForm>
          )}
        </div>
      )}
    </div>
  );
}
