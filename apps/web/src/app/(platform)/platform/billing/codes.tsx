import { formatMoney } from '@/lib/format';
import { Field, fieldCls, MiniForm } from '../_components/mini-form';
import { createDiscountCodeAction, revokeDiscountCodeAction } from './actions';

export interface CodeRow {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  appliesTo: 'base' | 'seats' | 'both';
  duration: 'once' | 'repeating' | 'forever';
  durationMonths: number | null;
  restrictedAgencyIds: string[] | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  revokedAt: string | null;
}

const APPLIES: Record<CodeRow['appliesTo'], string> = { base: 'Base price', seats: 'Seats', both: 'Base and seats' };
const off = (c: CodeRow) => (c.percentOff !== null ? `${c.percentOff}% off` : `${formatMoney(c.amountOffCents ?? 0, { unit: 'cents' })} off`);
const length = (c: CodeRow) => (c.duration === 'repeating' ? `${c.durationMonths} months` : c.duration === 'once' ? 'First invoice' : 'Forever');
const status = (c: CodeRow) => (c.revokedAt ? 'Revoked' : c.expiresAt && Date.parse(c.expiresAt) <= Date.now() ? 'Expired' : 'Active');

export function RevokeButton({ id, action }: { id: string; action: typeof revokeDiscountCodeAction }) {
  return (
    <MiniForm action={action} submit="Revoke" variant="outline" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
    </MiniForm>
  );
}

/** Discount codes: everyone sees the list; owners can create and revoke. */
export function Codes({ codes, canManage }: { codes: CodeRow[]; canManage: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              {['Code', 'Discount', 'Applies to', 'Length', 'Restricted', 'Expires', 'Max uses', 'Status', ''].map((h, i) => (
                <th key={h || `x${i}`} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className="border-t border-[#EEF2F6]">
                <td className="px-3 py-2 font-semibold">{c.code}</td>
                <td className="whitespace-nowrap px-3 py-2">{off(c)}</td>
                <td className="px-3 py-2">{APPLIES[c.appliesTo]}</td>
                <td className="px-3 py-2">{length(c)}</td>
                <td className="px-3 py-2">{c.restrictedAgencyIds ? `${c.restrictedAgencyIds.length} agencies` : 'No'}</td>
                <td className="whitespace-nowrap px-3 py-2">{c.expiresAt ? c.expiresAt.slice(0, 10) : '—'}</td>
                <td className="px-3 py-2">{c.maxRedemptions ?? '—'}</td>
                <td className="px-3 py-2">{status(c)}</td>
                <td className="px-3 py-2">{canManage && !c.revokedAt && <RevokeButton id={c.id} action={revokeDiscountCodeAction} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {codes.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No discount codes yet.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Restricted codes have no promotion code, so agencies cannot type them at checkout. Apply them through the agency&rsquo;s Redeem form or attach them from the agency page.
      </p>
      {canManage && (
        <MiniForm action={createDiscountCodeAction} submit="Create code" className="flex flex-wrap items-end gap-3 border-t border-[#EEF2F6] pt-4">
          <Field label="Code" htmlFor="dc-code"><input id="dc-code" name="code" required minLength={3} maxLength={64} autoComplete="off" className={`${fieldCls} w-40`} /></Field>
          <Field label="Type" htmlFor="dc-kind">
            <select id="dc-kind" name="kind" defaultValue="percent" className={fieldCls}>
              <option value="percent">Percent off</option>
              <option value="amount">Dollars off</option>
            </select>
          </Field>
          <Field label="Amount (% or $)" htmlFor="dc-amount"><input id="dc-amount" name="amount" required inputMode="decimal" className={`${fieldCls} w-28`} /></Field>
          <Field label="Applies to" htmlFor="dc-applies">
            <select id="dc-applies" name="appliesTo" defaultValue="both" className={fieldCls}>
              <option value="both">Base and seats</option>
              <option value="base">Base price</option>
              <option value="seats">Seats</option>
            </select>
          </Field>
          <Field label="Duration" htmlFor="dc-duration">
            <select id="dc-duration" name="duration" defaultValue="once" className={fieldCls}>
              <option value="once">First invoice</option>
              <option value="repeating">Repeating</option>
              <option value="forever">Forever</option>
            </select>
          </Field>
          <Field label="Months (repeating)" htmlFor="dc-months"><input id="dc-months" name="durationMonths" inputMode="numeric" className={`${fieldCls} w-24`} /></Field>
          <Field label="Expires" htmlFor="dc-expires"><input id="dc-expires" name="expires" type="date" className={fieldCls} /></Field>
          <Field label="Max uses" htmlFor="dc-max"><input id="dc-max" name="maxRedemptions" inputMode="numeric" className={`${fieldCls} w-24`} /></Field>
          <Field label="Restrict to agency ids (optional)" htmlFor="dc-restrict"><input id="dc-restrict" name="restrictedAgencyIds" placeholder="comma-separated" className={`${fieldCls} w-64`} /></Field>
        </MiniForm>
      )}
    </div>
  );
}
