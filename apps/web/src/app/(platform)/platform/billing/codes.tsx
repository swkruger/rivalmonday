import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { Field, fieldCls, MiniForm } from '../_components/mini-form';
import { ConfirmForm } from '@/components/confirm-form';
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
    <ConfirmForm
      action={action}
      submit="Revoke"
      variant="outline"
      title="Revoke this discount code?"
      body="It can no longer be used. Subscriptions that already have it keep their discount."
      confirmLabel="Revoke code"
      tone="danger"
      fields={{ id }}
      className="flex flex-wrap items-center gap-2"
    />
  );
}

/** Discount codes: everyone sees the list; owners can create and revoke. */
export function Codes({ codes, canManage, tz }: { codes: CodeRow[]; canManage: boolean; tz: string }) {
  return (
    <div className="flex flex-col gap-4">
      {codes.length === 0 ? (
        <p className="text-sm text-muted-ink">No discount codes yet.</p>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {['Code', 'Discount', 'Applies to', 'Length', 'Restricted', 'Expires', 'Max uses', 'Status', ''].map((h, i) => (
                  <TableHead key={h || `x${i}`}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.code}</TableCell>
                  <TableCell>{off(c)}</TableCell>
                  <TableCell>{APPLIES[c.appliesTo]}</TableCell>
                  <TableCell>{length(c)}</TableCell>
                  <TableCell>{c.restrictedAgencyIds ? `${c.restrictedAgencyIds.length} agencies` : 'No'}</TableCell>
                  <TableCell>{c.expiresAt ? formatDate(c.expiresAt, { tz }) : '—'}</TableCell>
                  <TableCell>{c.maxRedemptions ?? '—'}</TableCell>
                  <TableCell>{status(c)}</TableCell>
                  <TableCell>{canManage && !c.revokedAt && <RevokeButton id={c.id} action={revokeDiscountCodeAction} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      <p className="text-xs text-muted-ink">
        Restricted codes have no promotion code, so agencies cannot type them at checkout. Apply them through the agency&rsquo;s Redeem form or attach them from the agency page.
      </p>
      {canManage && (
        <MiniForm action={createDiscountCodeAction} submit="Create code" className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
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
