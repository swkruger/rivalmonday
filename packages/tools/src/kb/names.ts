import { clientFallbackFor, type KbNames, NEUTRAL_AGENCY_NAME } from '@cs/core';
import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_KB_PRODUCT_NAME = 'Rival Monday';
export const DEFAULT_KB_ASSISTANT_NAME = 'Friday';
export { NEUTRAL_AGENCY_NAME };

/**
 * The agency's white-label names for `renderKbText`: `branding.displayName` / `branding.assistantName`, trimmed, with the
 * Rival Monday / Friday defaults. Mirrors `productNameFor` (@cs/mcp) and `assistantNameFor` (web); @cs/tools cannot import
 * those packages (they depend on it). `clientFacing` (default false = agency-facing) never falls back to the Rival Monday
 * brand: with no agency display name the product reads "your agency". `clientFallback` is what `{{client}}` reads without a
 * client name: "your business" client-facing, "the client" otherwise.
 */
export async function kbNamesFor(
  service: Db,
  agencyId: string,
  opts: { clientFacing?: boolean } = {},
): Promise<Required<Pick<KbNames, 'productName' | 'assistantName' | 'clientFallback'>>> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  const pick = (v: unknown, d: string) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d);
  return {
    productName: pick(row?.branding?.displayName, opts.clientFacing ? NEUTRAL_AGENCY_NAME : DEFAULT_KB_PRODUCT_NAME),
    assistantName: pick(row?.branding?.assistantName, DEFAULT_KB_ASSISTANT_NAME),
    clientFallback: clientFallbackFor(opts.clientFacing === true),
  };
}
