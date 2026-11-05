/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { PlanFeature } from '@cs/core';
import { Text } from '../rx';
import { greeting, Layout } from '../layout';
import type { AgencyPlanChangeProps, PlanTerms } from '../types';

export const agencyPlanChangeSubject = () => 'Your Rival Monday plan is changing';

const money = (cents: number) => {
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const FEATURE_NAMES: Record<PlanFeature, string> = { ask: 'Ask', mcp: 'MCP access' };
const names = (fs: PlanFeature[]) => fs.map((f) => FEATURE_NAMES[f]).join(', ');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** YYYY-MM-DD to "November 3, 2026" (date-only, UTC; no timezone shift). */
function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
}
/** Billing-card wording (spec § Copy): "{base}/mo · {included} clients included · clients {from}–{to}: {price} each · clients {from}+: {price} each". */
const terms = (t: PlanTerms) =>
  [
    `${money(t.basePriceCents)}/mo${t.basePriceYearCents == null ? '' : ` (or ${money(t.basePriceYearCents)}/yr)`}`,
    `${t.includedSeats} clients included`,
    ...t.tiers.map((r) =>
      r.toClient === null ? `clients ${r.fromClient}+: ${money(r.unitCents)} each` : `clients ${r.fromClient}${r.toClient === r.fromClient ? '' : `–${r.toClient}`}: ${money(r.unitCents)} each`),
  ].join(' · ');

/**
 * Phase 15c-3b spec §3.5 (copy is decided): the platform tells an agency's admins its plan moved to the current
 * standard version. Always Rival Monday branded. Props carry no operator name.
 */
export function AgencyPlanChangeEmail(p: AgencyPlanChangeProps) {
  const subject = agencyPlanChangeSubject();
  const { before, after, effective } = p;
  return (
    <Layout branding={p.branding} title={subject} preview={subject}>
      <Text>{greeting(p.recipientName)}</Text>
      <Text>{`This is Rival Monday with a change to the ${p.agencyName} plan.`}</Text>
      {effective.kind === 'next_billing' ? (
        <Text>
          {`From ${effective.date ? dateText(effective.date) : 'your next billing date'}, your plan is ${terms(after)} (was ${terms(before)}).`}
        </Text>
      ) : (
        <Text>{`Your plan is now ${terms(after)}. These prices apply when you subscribe.`}</Text>
      )}
      {p.featuresAdded.length > 0 && <Text>{`Now included: ${names(p.featuresAdded)}.`}</Text>}
      {p.featuresRemoved.length > 0 && <Text>{`No longer included: ${names(p.featuresRemoved)}. This applies straight away.`}</Text>}
      <Text>You don't need to do anything. Questions? Reply to this email.</Text>
    </Layout>
  );
}
