import type { ClientBillingState } from '@cs/db';

export type ClientBillingPillKey = 'paused' | 'payment_needed' | 'invited' | 'paying' | 'off';
export interface ClientBillingPill { key: ClientBillingPillKey; label: string }

const LABELS: Record<ClientBillingPillKey, string> = { paused: 'Paused', payment_needed: 'Payment needed', invited: 'Invited', paying: 'Paying', off: 'Off' };
const pill = (key: ClientBillingPillKey): ClientBillingPill => ({ key, label: LABELS[key] });

/** Spec § Data model: Paused (client.paused_at) > Payment needed > Invited > Paying > Off. No `client_billing` row, or billing disabled, is Off. */
export function clientBillingPill(input: { pausedAt: Date | null; billing: { state: ClientBillingState; enabled: boolean } | null }): ClientBillingPill {
  if (input.pausedAt) return pill('paused');
  const b = input.billing;
  if (!b || !b.enabled) return pill('off');
  if (b.state === 'payment_needed') return pill('payment_needed');
  if (b.state === 'invited') return pill('invited');
  if (b.state === 'active') return pill('paying');
  return pill('off');
}
