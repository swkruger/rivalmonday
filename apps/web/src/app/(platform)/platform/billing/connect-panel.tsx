import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { StatStrip } from '@/components/stat-strip';
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
      <StatStrip
        headingLevel={3}
        items={[
          { title: 'Connected agencies', value: String(o.totals.connectedAgencies) },
          { title: 'Paying clients', value: String(o.totals.payingClients) },
          { title: 'Client MRR via Connect', value: formatMoney(o.totals.clientMrrCents, { unit: 'cents' }) },
          { title: 'Default fee', value: pct(o.globalFeePercent) },
        ]}
      />
      {o.agencies.length === 0 ? (
        <p className="text-sm text-muted-ink">No agency has connected Stripe yet.</p>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {['Agency', 'Status', 'Charges', 'Fee override', 'Paying', 'Payment needed', 'Client MRR'].map((h) => <TableHead key={h}>{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.agencies.map((a) => (
                <TableRow key={a.agencyId}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{STATUS[a.status]}</TableCell>
                  <TableCell>{a.chargesEnabled ? 'Enabled' : 'Off'}</TableCell>
                  <TableCell>{a.feeOverridePercent === null ? 'Default' : pct(a.feeOverridePercent)}</TableCell>
                  <TableCell>{a.payingClients}</TableCell>
                  <TableCell>{a.paymentNeededClients}</TableCell>
                  <TableCell>{formatMoney(a.clientMrrCents, { unit: 'cents' })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {canEdit && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted-ink">Fees apply to Checkout links created after the change; existing subscriptions keep their fee. 0 sends no fee.</p>
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
