import { formatDate, formatMoney } from '@/lib/format';
import { Field, fieldCls } from '../_components/mini-form';
import { ConfirmForm } from '@/components/confirm-form';
import { PLAN_FEATURE_LABEL } from '@/lib/labels';
import { createPlanVersionAction } from './actions';

export interface PlanRow {
  id: string;
  version: number;
  name: string;
  basePriceCents: number;
  includedSeats: number;
  seatPriceCents: number;
  trialDays: number;
  features: ('ask' | 'mcp')[];
  isCurrent: boolean;
  synced: boolean;
  createdAt: string;
}

/** Every plan version (read-only table); owners also get the "new version" form. Existing subscriptions keep their prices. */
export function PlanEditor({ plans, canEdit, tz }: { plans: PlanRow[]; canEdit: boolean; tz: string }) {
  const currentFeatures = plans.find((p) => p.isCurrent)?.features ?? ['ask', 'mcp'];
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              {['Version', 'Name', 'Base price', 'Included seats', 'Extra seat', 'Trial days', 'Includes', 'Created', 'Status'].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t border-[#EEF2F6]">
                <td className="px-3 py-2 font-semibold">v{p.version}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{formatMoney(p.basePriceCents, { unit: 'cents' })}</td>
                <td className="px-3 py-2">{p.includedSeats}</td>
                <td className="px-3 py-2">{formatMoney(p.seatPriceCents, { unit: 'cents' })}</td>
                <td className="px-3 py-2">{p.trialDays}</td>
                <td className="px-3 py-2">{p.features.length ? p.features.map((f) => PLAN_FEATURE_LABEL[f]).join(', ') : 'None'}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(p.createdAt, { tz })}</td>
                <td className="px-3 py-2">{p.isCurrent ? 'Current' : p.synced ? 'Superseded' : 'Not synced'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plans.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No plans yet.</p>}
      </div>
      {canEdit && (
        <ConfirmForm
          action={createPlanVersionAction}
          submit="Publish new version"
          title="Publish a new plan version?"
          body="It becomes the current plan for new subscriptions. Existing subscriptions keep their prices."
          confirmLabel="Publish version"
          className="flex flex-wrap items-end gap-3 border-t border-[#EEF2F6] pt-4"
        >
          <Field label="Name" htmlFor="plan-name"><input id="plan-name" name="name" required maxLength={80} defaultValue="Standard" className={fieldCls} /></Field>
          <Field label="Base price ($/month)" htmlFor="plan-base"><input id="plan-base" name="basePrice" required inputMode="decimal" className={`${fieldCls} w-32`} /></Field>
          <Field label="Included seats" htmlFor="plan-seats"><input id="plan-seats" name="includedSeats" required inputMode="numeric" className={`${fieldCls} w-28`} /></Field>
          <Field label="Extra seat ($/month)" htmlFor="plan-seat-price"><input id="plan-seat-price" name="seatPrice" required inputMode="decimal" className={`${fieldCls} w-32`} /></Field>
          <Field label="Trial days" htmlFor="plan-trial"><input id="plan-trial" name="trialDays" required inputMode="numeric" className={`${fieldCls} w-24`} /></Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Includes</legend>
            <div className="flex gap-4 text-sm">
              {(['ask', 'mcp'] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5">
                  <input type="checkbox" name="features" value={f} defaultChecked={currentFeatures.includes(f)} className="h-4 w-4 rounded border-input" /> {PLAN_FEATURE_LABEL[f]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="basis-full text-xs text-muted-foreground">A new version becomes current for new subscriptions. Existing subscriptions keep their prices.</p>
        </ConfirmForm>
      )}
    </div>
  );
}
