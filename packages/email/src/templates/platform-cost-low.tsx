/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from 'react-email';
import { Layout } from '../layout';
import type { PlatformCostLowProps } from '../types';

export const platformCostLowSubject = (p: Pick<PlatformCostLowProps, 'label'>) => `Rival Monday: low balance on ${p.label}`;

/** Phase 8c Task 5 (copy is binding). Always Rival Monday branded: the platform, not an agency, is writing to its owners. */
export const platformCostLowBody = (p: PlatformCostLowProps) =>
  `${p.label} is running low: ${p.amountText} left${p.daysLeft != null ? `, about ${p.daysLeft} days at the current rate` : ''}.` +
  `${p.billingUrl ? ` Top up: ${p.billingUrl}.` : ''} See all costs: ${p.costsUrl}`;

export function PlatformCostLowEmail(p: PlatformCostLowProps) {
  return (
    <Layout branding={p.branding} title={platformCostLowSubject(p)} preview={platformCostLowSubject(p)} footer="Platform cost alert">
      <Text>{platformCostLowBody(p)}</Text>
    </Layout>
  );
}
