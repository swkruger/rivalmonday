import { PLAN_FEATURES } from '@cs/core';
import { nativeInputClass, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { Field } from '../_components/mini-form';
import { ConfirmForm } from '@/components/confirm-form';
import { PLAN_FEATURE_LABEL } from '@/lib/labels';
import { describeTiers } from '@cs/billing';
import { createPlanVersionAction } from './actions';

export interface PlanRow {
  id: string;
  version: number;
  name: string;
  basePriceCents: number;
  includedSeats: number;
  basePriceYearCents: number | null;
  seatTiers: { upTo: number | null; unitCents: number }[];
  trialDays: number;
  features: ('ask' | 'mcp')[];
  isCurrent: boolean;
  synced: boolean;
  createdAt: string;
}

const TIER_ROWS = [0, 1, 2, 3, 4];

/** "4–10: $79, 11+: $59" from the stored tiers. */
function tierText(p: Pick<PlanRow, 'includedSeats' | 'seatTiers'>): string {
  return describeTiers(p.includedSeats, p.seatTiers)
    .map((t) => `${t.toClient === null ? `${t.fromClient}+` : `${t.fromClient}–${t.toClient}`}: ${formatMoney(t.unitCents, { unit: 'cents' })}`)
    .join(', ');
}

/** Every plan version (read-only table); owners also get the "new version" form. Existing subscriptions keep their prices. */
export function PlanEditor({ plans, canEdit, tz }: { plans: PlanRow[]; canEdit: boolean; tz: string }) {
  const currentFeatures = plans.find((p) => p.isCurrent)?.features ?? PLAN_FEATURES;
  return (
    <div className="flex flex-col gap-4">
      {plans.length === 0 ? (
        <p className="text-sm text-muted-ink">No plans yet.</p>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {['Version', 'Name', 'Base price', 'Yearly base', 'Included seats', 'Extra clients', 'Trial days', 'Includes', 'Created', 'Status'].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">v{p.version}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{formatMoney(p.basePriceCents, { unit: 'cents' })}</TableCell>
                  <TableCell>{p.basePriceYearCents === null ? 'None' : formatMoney(p.basePriceYearCents, { unit: 'cents' })}</TableCell>
                  <TableCell>{p.includedSeats}</TableCell>
                  <TableCell>{tierText(p)}</TableCell>
                  <TableCell>{p.trialDays}</TableCell>
                  <TableCell>{p.features.length ? p.features.map((f) => PLAN_FEATURE_LABEL[f]).join(', ') : 'None'}</TableCell>
                  <TableCell>{formatDate(p.createdAt, { tz })}</TableCell>
                  <TableCell>{p.isCurrent ? 'Current' : p.synced ? 'Superseded' : 'Not synced'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {canEdit && (
        <ConfirmForm
          action={createPlanVersionAction}
          submit="Publish new version"
          title="Publish a new plan version?"
          body="It becomes the current plan for new subscriptions. Existing subscriptions keep their prices."
          confirmLabel="Publish version"
          className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
        >
          <Field label="Name" htmlFor="plan-name"><input id="plan-name" name="name" required maxLength={80} defaultValue="Standard" className={nativeInputClass} /></Field>
          <Field label="Base price ($/month)" htmlFor="plan-base"><input id="plan-base" name="basePrice" required inputMode="decimal" className={`${nativeInputClass} w-32`} /></Field>
          <Field label="Included seats" htmlFor="plan-seats"><input id="plan-seats" name="includedSeats" required inputMode="numeric" className={`${nativeInputClass} w-28`} /></Field>
          <Field label="Yearly base price ($/year, optional)" htmlFor="plan-base-year"><input id="plan-base-year" name="basePriceYear" inputMode="decimal" className={`${nativeInputClass} w-40`} /></Field>
          <Field label="Trial days" htmlFor="plan-trial"><input id="plan-trial" name="trialDays" required inputMode="numeric" className={`${nativeInputClass} w-24`} /></Field>
          <fieldset className="flex basis-full flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Extra client prices ($/month each; up to 5 rows, the last runs on)</legend>
            <div className="flex flex-col gap-2">
              {TIER_ROWS.map((i) => (
                <div key={i} className="flex flex-wrap items-end gap-3">
                  <Field label="From client" htmlFor={`plan-tier-from-${i}`}><input id={`plan-tier-from-${i}`} name={`tierFrom${i}`} required={i === 0} inputMode="numeric" className={`${nativeInputClass} w-28`} /></Field>
                  <Field label="Price per client" htmlFor={`plan-tier-price-${i}`}><input id={`plan-tier-price-${i}`} name={`tierPrice${i}`} required={i === 0} inputMode="decimal" className={`${nativeInputClass} w-32`} /></Field>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Includes</legend>
            <div className="flex gap-4 text-sm">
              {PLAN_FEATURES.map((f) => (
                <label key={f} className="flex items-center gap-1.5">
                  <input type="checkbox" name="features" value={f} defaultChecked={currentFeatures.includes(f)} className="h-4 w-4 rounded border-input" /> {PLAN_FEATURE_LABEL[f]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="basis-full text-xs text-muted-ink">A new version becomes current for new subscriptions. Existing subscriptions keep their prices.</p>
        </ConfirmForm>
      )}
    </div>
  );
}
