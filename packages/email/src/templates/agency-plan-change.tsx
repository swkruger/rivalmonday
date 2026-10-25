/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { PlanFeature } from '@cs/core';
import { Text } from 'react-email';
import { greeting, Layout } from '../layout';
import type { AgencyPlanChangeProps, PlanTerms } from '../types';

export const agencyPlanChangeSubject = () => 'Your Rival Monday plan is changing';

const money = (cents: number) => {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
};
const FEATURE_NAMES: Record<PlanFeature, string> = { ask: 'Ask', mcp: 'MCP access' };
const names = (fs: PlanFeature[]) => fs.map((f) => FEATURE_NAMES[f]).join(', ');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** YYYY-MM-DD to "November 3, 2026" (date-only, UTC; no timezone shift). */
function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
}
const terms = (t: PlanTerms) => `${money(t.basePriceCents)}/month including ${t.includedSeats} client seats, then ${money(t.seatPriceCents)} per extra seat`;

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
      {effective.kind === 'next_billing' ? (
        <Text>
          {`From ${effective.date ? dateText(effective.date) : 'your next billing date'}, your plan is ${terms(after)} (was ${money(before.basePriceCents)} with ${before.includedSeats} seats, ${money(before.seatPriceCents)} each).`}
        </Text>
      ) : (
        <Text>{`Your plan is now ${terms(after)}. These prices apply when you subscribe.`}</Text>
      )}
      {p.featuresAdded.length > 0 && <Text>{`Now included: ${names(p.featuresAdded)}.`}</Text>}
      {p.featuresRemoved.length > 0 && <Text>{`No longer included: ${names(p.featuresRemoved)}. This applies straight away.`}</Text>}
      <Text>Questions? Reply to this email.</Text>
    </Layout>
  );
}
