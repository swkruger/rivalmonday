import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_KB_PRODUCT_NAME = 'Rival Monday';
export const DEFAULT_KB_ASSISTANT_NAME = 'Friday';

/**
 * The agency's white-label names for `renderKbText`: `branding.displayName` / `branding.assistantName`, trimmed, with the
 * Rival Monday / Friday defaults. Mirrors `productNameFor` (@cs/mcp) and `assistantNameFor` (web); @cs/tools cannot import
 * those packages (they depend on it). `clientFacing` (default false = agency-facing) never falls back to the Rival Monday
 * brand: with no agency display name the product reads "your agency".
 */
export async function kbNamesFor(
  service: Db,
  agencyId: string,
  opts: { clientFacing?: boolean } = {},
): Promise<{ productName: string; assistantName: string }> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  const pick = (v: unknown, d: string) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d);
  return { productName: pick(row?.branding?.displayName, opts.clientFacing ? 'your agency' : DEFAULT_KB_PRODUCT_NAME), assistantName: pick(row?.branding?.assistantName, DEFAULT_KB_ASSISTANT_NAME) };
}
