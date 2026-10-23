import { formatMoney } from '@/lib/format';
import { Field, fieldCls, MiniForm } from '../_components/mini-form';
import { createPlanVersionAction } from './actions';

export interface PlanRow {
  id: string;
  version: number;
  name: string;
  basePriceCents: number;
  includedSeats: number;
  seatPriceCents: number;
  trialDays: number;
  isCurrent: boolean;
  synced: boolean;
  createdAt: string;
}

/** Every plan version (read-only table); owners also get the "new version" form. Existing subscriptions keep their prices. */
export function PlanEditor({ plans, canEdit }: { plans: PlanRow[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              {['Version', 'Name', 'Base price', 'Included seats', 'Extra seat', 'Trial days', 'Created', 'Status'].map((h) => (
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
                <td className="whitespace-nowrap px-3 py-2">{p.createdAt.slice(0, 10)}</td>
                <td className="px-3 py-2">{p.isCurrent ? 'Current' : p.synced ? 'Superseded' : 'Not synced'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plans.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No plans yet.</p>}
      </div>
      {canEdit && (
        <MiniForm action={createPlanVersionAction} submit="Publish new version" className="flex flex-wrap items-end gap-3 border-t border-[#EEF2F6] pt-4">
          <Field label="Name" htmlFor="plan-name"><input id="plan-name" name="name" required maxLength={80} defaultValue="Standard" className={fieldCls} /></Field>
          <Field label="Base price ($/month)" htmlFor="plan-base"><input id="plan-base" name="basePrice" required inputMode="decimal" className={`${fieldCls} w-32`} /></Field>
          <Field label="Included seats" htmlFor="plan-seats"><input id="plan-seats" name="includedSeats" required inputMode="numeric" className={`${fieldCls} w-28`} /></Field>
          <Field label="Extra seat ($/month)" htmlFor="plan-seat-price"><input id="plan-seat-price" name="seatPrice" required inputMode="decimal" className={`${fieldCls} w-32`} /></Field>
          <Field label="Trial days" htmlFor="plan-trial"><input id="plan-trial" name="trialDays" required inputMode="numeric" className={`${fieldCls} w-24`} /></Field>
          <p className="basis-full text-xs text-muted-foreground">A new version becomes current for new subscriptions. Existing subscriptions keep their prices.</p>
        </MiniForm>
      )}
    </div>
  );
}
